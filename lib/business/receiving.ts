import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { applyStockMovement, round3 } from "./inventory";
import { nextDocumentNumber } from "./numbering";
import { refreshPurchase } from "./procurement";
import { round2 } from "./totals";

/**
 * Receiving goods from a purchase.
 *
 * This is the only way stock arrives from Procurement, and until it existed stock could only ever
 * leave: sales, recipes and rentals took it out, nothing put it in except a manual adjustment.
 *
 * Three rules carry it:
 *
 * 1. A purchase line only becomes stock when it is **linked to a catalogue item**. Most purchases
 *    also carry rent, courier and fees, which are costs and not things on a shelf. The link is made
 *    when a line is first received and remembered after that.
 * 2. The cost recorded is the line's price **net of its discount and excluding VAT** — VAT is
 *    recoverable, so it never belongs in the value of stock.
 * 3. Quantities move through `applyStockMovement` inside the receipt's own transaction, so a shelf
 *    never says something arrived when the paperwork says it did not.
 */

export type ReceivableLine = {
  purchaseItemId: string;
  description: string;
  /** The catalogue item this line buys, once it is known. */
  variantId: string | null;
  variantName: string | null;
  unit: string | null;
  /** Whether that item keeps stock levels at all (a service bought in does not). */
  tracksStock: boolean;
  orderedQuantity: number;
  receivedQuantity: number;
  outstandingQuantity: number;
  /** Per unit, net of the line discount, VAT excluded. */
  unitCost: number;
};

/** What is still to arrive on a purchase, line by line. */
export async function getReceivableLines(purchaseId: string): Promise<ReceivableLine[]> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { variant: { select: { id: true, name: true, item: { select: { name: true, unit: true, trackStock: true, kind: true } } } } },
      },
    },
  });
  if (!purchase) throw new BusinessError("That purchase no longer exists.");

  return purchase.items.map((item) => {
    const ordered = num(item.quantity);
    const received = num(item.receivedQuantity);
    // The line's own figures already hold the discount, so the cost comes straight off them.
    const net = num(item.lineSubtotal) - num(item.lineDiscount);
    const variant = item.variant;
    return {
      purchaseItemId: item.id,
      description: item.description,
      variantId: variant?.id ?? null,
      variantName: variant ? (variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name) : null,
      unit: variant?.item.unit ?? null,
      tracksStock: Boolean(variant && variant.item.trackStock && variant.item.kind === "PRODUCT"),
      orderedQuantity: ordered,
      receivedQuantity: received,
      outstandingQuantity: round2(Math.max(0, ordered - received)),
      unitCost: ordered > 0 ? round2(net / ordered) : 0,
    };
  });
}

export type ReceiveLineInput = {
  purchaseItemId: string;
  /** The catalogue item this line buys. Required: a line with no item is a cost, not stock. */
  variantId: string;
  quantity: number;
};

export type ReceiveGoodsInput = {
  purchaseId: string;
  branchId: string;
  date: string;
  lines: ReceiveLineInput[];
  note: string | null;
  /** Writes the received cost onto the item, so margins use what was last actually paid. */
  updateCostPrice: boolean;
  user: { id: string; name: string };
};

export async function receiveGoods(input: ReceiveGoodsInput) {
  const purchase = await db.purchase.findUnique({ where: { id: input.purchaseId }, select: { id: true, number: true, receivedAt: true } });
  if (!purchase) throw new BusinessError("That purchase no longer exists.");

  const branch = await db.branch.findUnique({ where: { id: input.branchId }, select: { id: true, name: true, isActive: true } });
  if (!branch) throw new BusinessError("Choose the branch the goods arrived at.");
  if (!branch.isActive) throw new BusinessError(`${branch.name} is not in use.`);

  const receivable = await getReceivableLines(input.purchaseId);
  if (input.lines.length === 0) throw new BusinessError("Say what arrived.");

  // Everything is checked before anything is written, so a bad line cannot half-receive a delivery.
  const variants = await db.itemVariant.findMany({
    where: { id: { in: [...new Set(input.lines.map((line) => line.variantId))] } },
    select: { id: true, name: true, isActive: true, item: { select: { name: true, unit: true, kind: true, trackStock: true, isActive: true } } },
  });

  const prepared = input.lines.map((line) => {
    const original = receivable.find((row) => row.purchaseItemId === line.purchaseItemId);
    if (!original) throw new BusinessError("One of those lines is not on this purchase.");
    const quantity = round3(num(line.quantity));
    if (quantity <= 0) throw new BusinessError(`Enter how much of "${original.description}" arrived.`);
    if (quantity > original.outstandingQuantity + 0.0001) {
      throw new BusinessError(
        original.outstandingQuantity === 0
          ? `"${original.description}" has already arrived in full.`
          : `Only ${original.outstandingQuantity} of "${original.description}" is still outstanding.`,
      );
    }

    const variant = variants.find((row) => row.id === line.variantId);
    if (!variant) throw new BusinessError("One of those items no longer exists.");
    if (!variant.isActive || !variant.item.isActive) throw new BusinessError(`${variant.item.name} is no longer in the catalogue.`);
    if (variant.item.kind !== "PRODUCT") throw new BusinessError(`${variant.item.name} is a service, so there is nothing to put on a shelf.`);

    return {
      purchaseItemId: original.purchaseItemId,
      variantId: variant.id,
      name: variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name,
      unit: variant.item.unit,
      tracksStock: variant.item.trackStock,
      quantity,
      unitCost: original.unitCost,
    };
  });

  const date = new Date(`${input.date}T00:00:00.000Z`);

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "GOODS_RECEIPT", date);

    const receipt = await tx.purchaseReceipt.create({
      data: {
        number,
        purchaseId: purchase.id,
        branchId: branch.id,
        date,
        note: input.note,
        receivedById: input.user.id,
        receivedByName: input.user.name,
        items: {
          create: prepared.map((line, index) => ({
            purchaseItemId: line.purchaseItemId,
            variantId: line.variantId,
            name: line.name,
            unit: line.unit,
            quantity: line.quantity,
            unitCost: line.unitCost,
            sortOrder: index,
          })),
        },
      },
      select: { id: true, number: true },
    });

    for (const line of prepared) {
      // The link is remembered, so the next delivery against this line needs no picking.
      await tx.purchaseItem.update({
        where: { id: line.purchaseItemId },
        data: { variantId: line.variantId, receivedQuantity: { increment: line.quantity } },
      });

      // An item that keeps no stock levels (bought in to order) is still recorded on the receipt.
      if (line.tracksStock) {
        await applyStockMovement(tx, {
          variantId: line.variantId,
          branchId: branch.id,
          kind: "PURCHASE_RECEIPT",
          quantity: line.quantity,
          unitCost: line.unitCost,
          referenceType: "PURCHASE",
          referenceId: purchase.id,
          reference: `${purchase.number} · ${receipt.number}`,
          note: input.note,
          userId: input.user.id,
          userName: input.user.name,
        });
      }

      if (input.updateCostPrice && line.unitCost > 0) {
        await tx.itemVariant.update({ where: { id: line.variantId }, data: { costPrice: line.unitCost } });
      }
    }

    // Goods arriving is what makes a purchase received, which is what its status derives from.
    if (!purchase.receivedAt) await tx.purchase.update({ where: { id: purchase.id }, data: { receivedAt: new Date() } });
    const refreshed = await refreshPurchase(tx, purchase.id);

    return {
      id: receipt.id,
      number: receipt.number,
      purchaseNumber: purchase.number,
      branchName: branch.name,
      lines: prepared.length,
      stockLines: prepared.filter((line) => line.tracksStock).length,
      status: refreshed.status,
    };
  });
}

/**
 * Withdraws a receipt keyed in error. The record stays — somebody signed for it — and the stock
 * goes back off the shelf as an **adjustment**, because the goods were never really there: they
 * were not returned to the supplier, which would be a different movement with a different meaning.
 */
export async function cancelReceipt(input: { receiptId: string; reason: string; user: { id: string; name: string } }) {
  const receipt = await db.purchaseReceipt.findUnique({
    where: { id: input.receiptId },
    include: { items: true, purchase: { select: { id: true, number: true } } },
  });
  if (!receipt) throw new BusinessError("That receipt no longer exists.");
  if (receipt.status === "CANCELLED") throw new BusinessError("That receipt has already been cancelled.");

  const variants = await db.itemVariant.findMany({
    where: { id: { in: receipt.items.map((item) => item.variantId).filter((id): id is string => Boolean(id)) } },
    select: { id: true, item: { select: { trackStock: true, kind: true } } },
  });

  return db.$transaction(async (tx) => {
    for (const item of receipt.items) {
      if (item.purchaseItemId) {
        await tx.purchaseItem.update({ where: { id: item.purchaseItemId }, data: { receivedQuantity: { decrement: num(item.quantity) } } });
      }
      const variant = variants.find((row) => row.id === item.variantId);
      if (!item.variantId || !variant?.item.trackStock || variant.item.kind !== "PRODUCT") continue;
      await applyStockMovement(tx, {
        variantId: item.variantId,
        branchId: receipt.branchId,
        kind: "ADJUSTMENT",
        quantity: -num(item.quantity),
        unitCost: num(item.unitCost),
        referenceType: "PURCHASE_RECEIPT_CANCELLED",
        referenceId: receipt.id,
        reference: receipt.number,
        note: input.reason,
        userId: input.user.id,
        userName: input.user.name,
      });
    }

    await tx.purchaseReceipt.update({
      where: { id: receipt.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledByName: input.user.name, cancelReason: input.reason },
    });

    const refreshed = await refreshPurchase(tx, receipt.purchase.id);
    return { number: receipt.number, purchaseNumber: receipt.purchase.number, status: refreshed.status };
  });
}
