import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";

/** Reads for the floor plan and the open orders running on it. */

/** Every table at a branch, with the open order on it (a PARKED sale) where there is one. */
export async function listTables(branchId: string, options?: { activeOnly?: boolean }) {
  const tables = await db.posTable.findMany({
    where: { branchId, ...(options?.activeOnly ? { isActive: true } : {}) },
    orderBy: [{ area: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: {
      sales: {
        where: { status: "PARKED" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          number: true,
          grandTotal: true,
          guestCount: true,
          createdAt: true,
          cashierName: true,
          customer: { select: { name: true } },
          // The lines come with the floor plan so splitting a bill needs no second round trip.
          items: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              quantity: true,
              unitPrice: true,
              modifiers: { orderBy: { sortOrder: "asc" }, select: { optionName: true } },
            },
          },
        },
      },
    },
  });

  return tables.map((table) => ({
    id: table.id,
    name: table.name,
    area: table.area,
    seats: table.seats,
    sortOrder: table.sortOrder,
    isActive: table.isActive,
    /** More than one only after a bill is split, which is exactly when the floor needs to see both. */
    orders: table.sales.map((sale) => ({
      id: sale.id,
      number: sale.number,
      total: num(sale.grandTotal),
      guestCount: sale.guestCount,
      openedAt: sale.createdAt,
      cashierName: sale.cashierName,
      customerName: sale.customer?.name ?? null,
      itemCount: sale.items.length,
      lines: sale.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: num(item.quantity),
        unitPrice: num(item.unitPrice),
        modifiers: item.modifiers.map((modifier) => modifier.optionName),
      })),
    })),
  }));
}

export type TableRow = Awaited<ReturnType<typeof listTables>>[number];
export type TableOrder = TableRow["orders"][number];

/** A held order as the till needs to pick it up: lines with their chosen options. */
export async function getOrder(saleId: string, branchId: string) {
  const sale = await db.posSale.findFirst({
    where: { id: saleId, branchId, status: "PARKED" },
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { modifiers: { orderBy: { sortOrder: "asc" } } } },
      table: { select: { id: true, name: true, seats: true } },
    },
  });
  if (!sale) return null;

  return {
    id: sale.id,
    number: sale.number,
    note: sale.note,
    customerId: sale.customerId,
    guestCount: sale.guestCount,
    tabName: sale.tabName,
    openedAt: sale.createdAt,
    table: sale.table,
    total: num(sale.grandTotal),
    lines: sale.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      name: item.name,
      unit: item.unit,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      /** Already includes any cart-wide discount, so it travels with the line. */
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
      lineTotal: num(item.lineTotal),
      // An option whose row is gone cannot be priced again, so it does not travel back to the
      // till; the receipt still shows it, because that lives on the snapshot.
      modifiers: item.modifiers
        .filter((modifier): modifier is typeof modifier & { optionId: string } => modifier.optionId !== null)
        .map((modifier) => ({
          optionId: modifier.optionId,
          groupName: modifier.groupName,
          optionName: modifier.optionName,
          priceDelta: num(modifier.priceDelta),
        })),
    })),
  };
}

export type OpenOrder = NonNullable<Awaited<ReturnType<typeof getOrder>>>;

/** Held orders at this branch, for the transfer and merge pickers. */
export async function listOpenOrders(branchId: string) {
  const sales = await db.posSale.findMany({
    where: { branchId, status: "PARKED", tableId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, grandTotal: true, table: { select: { id: true, name: true } } },
  });
  return sales.map((sale) => ({
    id: sale.id,
    number: sale.number,
    total: num(sale.grandTotal),
    tableId: sale.table?.id ?? null,
    tableName: sale.table?.name ?? null,
  }));
}

export type OpenOrderRow = Awaited<ReturnType<typeof listOpenOrders>>[number];

/** Open bar tabs at this branch: a held bill with a name instead of a table. */
export async function listTabs(branchId: string) {
  const sales = await db.posSale.findMany({
    where: { branchId, status: "PARKED", tableId: null, tabName: { not: null } },
    orderBy: { createdAt: "asc" },
    include: {
      customer: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, quantity: true, unitPrice: true, modifiers: { orderBy: { sortOrder: "asc" }, select: { optionName: true } } },
      },
    },
  });

  return sales.map((sale) => ({
    id: sale.id,
    number: sale.number,
    name: sale.tabName ?? "Tab",
    total: num(sale.grandTotal),
    openedAt: sale.createdAt,
    cashierName: sale.cashierName,
    customerName: sale.customer?.name ?? null,
    itemCount: sale.items.length,
    lines: sale.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      modifiers: item.modifiers.map((modifier) => modifier.optionName),
    })),
  }));
}

export type TabRow = Awaited<ReturnType<typeof listTabs>>[number];
