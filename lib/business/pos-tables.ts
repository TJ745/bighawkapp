import "server-only";
import { db, type Tx } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { nextDocumentNumber } from "./numbering";
import { calcLine, round2 } from "./totals";

/**
 * Dine-in table service.
 *
 * An open order is a PARKED `PosSale` pointing at a `PosTable` — not a second kind of document —
 * so everything the till already does (prices from the catalogue, modifiers, VAT, receipts,
 * Finance) applies to it unchanged. What lives here is only what tables add: moving an order to
 * another table, merging two of them, and splitting one bill into two.
 *
 * Moving items between orders never touches stock: a held order has not moved any yet, which is
 * why these operations are safe to run on them and refused on anything already paid.
 */


/**
 * Recomputes a held order's totals from its stored lines.
 *
 * Each line's `discountPercent` already has the cart-wide discount folded into it, so summing the
 * lines is the whole answer — and an order built by merging two bills with different cart
 * discounts still adds up, because the figures travel with the lines. `cartDiscountPercent` is
 * therefore cleared: the discount now lives on the lines it was applied to.
 */
async function recomputeOrderTotals(tx: Tx, saleId: string) {
  const items = await tx.posSaleItem.findMany({ where: { saleId }, orderBy: { sortOrder: "asc" } });
  let subtotal = 0;
  let discountTotal = 0;
  let vatTotal = 0;
  let costTotal = 0;
  for (const item of items) {
    subtotal += num(item.lineSubtotal);
    discountTotal += num(item.lineDiscount);
    vatTotal += num(item.lineVat);
    costTotal += num(item.quantity) * num(item.unitCost);
  }
  const totals = {
    subtotal: round2(subtotal),
    discountTotal: round2(discountTotal),
    vatTotal: round2(vatTotal),
    costTotal: round2(costTotal),
  };
  const grandTotal = round2(totals.subtotal - totals.discountTotal + totals.vatTotal);
  await tx.posSale.update({
    where: { id: saleId },
    data: { ...totals, grandTotal, cartDiscountPercent: 0 },
  });
  return { ...totals, grandTotal, itemCount: items.length };
}

/** The held order running on a table, or null when the table is free. */
export async function getOpenOrder(tableId: string) {
  return db.posSale.findFirst({
    where: { tableId, status: "PARKED" },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, grandTotal: true, createdAt: true, guestCount: true },
  });
}

/** Checks a table can take an order, and that it belongs to the branch in use. */
export async function assertTableFree(tableId: string, branchId: string) {
  const table = await db.posTable.findUnique({ where: { id: tableId }, select: { id: true, name: true, branchId: true, isActive: true } });
  if (!table || table.branchId !== branchId) throw new BusinessError("That table is not at this branch.");
  if (!table.isActive) throw new BusinessError(`${table.name} is not in use.`);
  const open = await getOpenOrder(tableId);
  if (open) throw new BusinessError(`${table.name} already has an open order (${open.number}).`);
  return table;
}

/** Moves a held order to another table — a party that changes seats, or a mis-keyed table. */
export async function transferOrder(input: { saleId: string; tableId: string; branchId: string }) {
  const sale = await db.posSale.findUnique({
    where: { id: input.saleId },
    select: { id: true, number: true, status: true, branchId: true, tableId: true, table: { select: { name: true } } },
  });
  if (!sale) throw new BusinessError("That order no longer exists.");
  if (sale.status !== "PARKED") throw new BusinessError("Only an open order can be moved.");
  if (sale.branchId !== input.branchId) throw new BusinessError("That order belongs to another branch.");
  if (sale.tableId === input.tableId) throw new BusinessError("That order is already on this table.");

  const table = await assertTableFree(input.tableId, input.branchId);
  await db.posSale.update({ where: { id: sale.id }, data: { tableId: table.id } });
  return { number: sale.number, from: sale.table?.name ?? null, to: table.name };
}

/**
 * Merges one held order into another: two tables joining, or two bills that should be one.
 * The lines move across with their own figures, and the emptied order is removed — it took no
 * money and moved no stock, so there is nothing to keep.
 */
export async function mergeOrders(input: { sourceId: string; targetId: string; branchId: string }) {
  if (input.sourceId === input.targetId) throw new BusinessError("Choose two different orders.");

  const [source, target] = await Promise.all([
    db.posSale.findUnique({
      where: { id: input.sourceId },
      select: { id: true, number: true, status: true, branchId: true, note: true, table: { select: { name: true } }, _count: { select: { items: true } } },
    }),
    db.posSale.findUnique({
      where: { id: input.targetId },
      select: { id: true, number: true, status: true, branchId: true, note: true, table: { select: { name: true } }, _count: { select: { items: true } } },
    }),
  ]);
  if (!source || !target) throw new BusinessError("One of those orders no longer exists.");
  for (const sale of [source, target]) {
    if (sale.status !== "PARKED") throw new BusinessError(`${sale.number} has already been paid or voided.`);
    if (sale.branchId !== input.branchId) throw new BusinessError(`${sale.number} belongs to another branch.`);
  }

  return db.$transaction(async (tx) => {
    // The modifier snapshots hang off the line, so moving the line takes its options with it.
    const moving = await tx.posSaleItem.findMany({ where: { saleId: source.id }, orderBy: { sortOrder: "asc" }, select: { id: true } });
    for (const [index, item] of moving.entries()) {
      await tx.posSaleItem.update({ where: { id: item.id }, data: { saleId: target.id, sortOrder: target._count.items + index } });
    }
    await tx.posSale.delete({ where: { id: source.id } });
    const totals = await recomputeOrderTotals(tx, target.id);
    return {
      number: target.number,
      mergedNumber: source.number,
      from: source.table?.name ?? null,
      to: target.table?.name ?? null,
      grandTotal: totals.grandTotal,
    };
  });
}

export type SplitLineInput = { saleItemId: string; quantity: number };

/**
 * Splits part of a held order onto a second bill on the same table, so one group can pay
 * separately. Quantities may be split too — two of three coffees — and each new line keeps the
 * original's snapshot and chosen options.
 */
export async function splitOrder(input: { saleId: string; lines: SplitLineInput[]; branchId: string; cashier: { id: string; name: string }; today: string }) {
  const sale = await db.posSale.findUnique({
    where: { id: input.saleId },
    include: { items: { orderBy: { sortOrder: "asc" }, include: { modifiers: { orderBy: { sortOrder: "asc" } } } } },
  });
  if (!sale) throw new BusinessError("That order no longer exists.");
  if (sale.status !== "PARKED") throw new BusinessError("Only an open order can be split.");
  if (sale.branchId !== input.branchId) throw new BusinessError("That order belongs to another branch.");

  const chosen = input.lines.filter((line) => num(line.quantity) > 0);
  if (chosen.length === 0) throw new BusinessError("Choose what moves to the second bill.");

  let movedAll = true;
  for (const line of chosen) {
    const item = sale.items.find((i) => i.id === line.saleItemId);
    if (!item) throw new BusinessError("One of those lines is not on this order.");
    const quantity = num(line.quantity);
    if (quantity > num(item.quantity) + 0.0001) throw new BusinessError(`There are only ${num(item.quantity)} × ${item.name} on this order.`);
    if (quantity < num(item.quantity) - 0.0001) movedAll = false;
  }
  if (movedAll && chosen.length === sale.items.length) throw new BusinessError("Leave at least one item on the original bill.");

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "POS_SALE", new Date());

    const rows = chosen.map((line, index) => {
      const item = sale.items.find((i) => i.id === line.saleItemId)!;
      const quantity = num(line.quantity);
      const lineTotals = calcLine({
        quantity,
        unitPrice: num(item.unitPrice),
        discountPercent: num(item.discountPercent),
        vatRate: num(item.vatRate),
      });
      return {
        variantId: item.variantId,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        quantity,
        unitPrice: num(item.unitPrice),
        unitCost: num(item.unitCost),
        discountPercent: num(item.discountPercent),
        vatRate: num(item.vatRate),
        lineSubtotal: lineTotals.subtotal,
        lineDiscount: lineTotals.discount,
        lineVat: lineTotals.vat,
        lineTotal: lineTotals.total,
        movedStock: false,
        sortOrder: index,
        modifiers: {
          create: item.modifiers.map((modifier, position) => ({
            optionId: modifier.optionId,
            groupName: modifier.groupName,
            optionName: modifier.optionName,
            priceDelta: num(modifier.priceDelta),
            sortOrder: position,
          })),
        },
      };
    });

    const second = await tx.posSale.create({
      data: {
        number,
        branchId: sale.branchId,
        registerId: sale.registerId,
        customerId: null,
        tableId: sale.tableId,
        guestCount: null,
        status: "PARKED",
        date: new Date(`${input.today}T00:00:00.000Z`),
        note: `Split from ${sale.number}`,
        cashierId: input.cashier.id,
        cashierName: input.cashier.name,
        items: { create: rows },
      },
      select: { id: true, number: true },
    });

    // What moved comes off the original: the whole line, or the part that was taken.
    for (const line of chosen) {
      const item = sale.items.find((i) => i.id === line.saleItemId)!;
      const remaining = Math.round((num(item.quantity) - num(line.quantity)) * 1000) / 1000;
      if (remaining <= 0) {
        await tx.posSaleItem.delete({ where: { id: item.id } });
        continue;
      }
      const lineTotals = calcLine({
        quantity: remaining,
        unitPrice: num(item.unitPrice),
        discountPercent: num(item.discountPercent),
        vatRate: num(item.vatRate),
      });
      await tx.posSaleItem.update({
        where: { id: item.id },
        data: {
          quantity: remaining,
          lineSubtotal: lineTotals.subtotal,
          lineDiscount: lineTotals.discount,
          lineVat: lineTotals.vat,
          lineTotal: lineTotals.total,
        },
      });
    }

    const [original, split] = await Promise.all([recomputeOrderTotals(tx, sale.id), recomputeOrderTotals(tx, second.id)]);
    return {
      number: sale.number,
      splitNumber: second.number,
      splitId: second.id,
      originalTotal: original.grandTotal,
      splitTotal: split.grandTotal,
    };
  });
}
