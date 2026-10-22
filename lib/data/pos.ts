import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { num } from "@/lib/decimal";
import { getStockLevels } from "@/lib/business/inventory";
import { paginate, type ListParams } from "@/lib/list-params";
import { round2 } from "@/lib/business/totals";

/** Reads for the till and the sales history. */

/** The catalogue as the register needs it: priced, in stock, searchable by name/SKU/barcode. */
export async function listRegisterItems(branchId: string) {
  const variants = await db.itemVariant.findMany({
    where: { isActive: true, item: { isActive: true } },
    orderBy: [{ item: { name: "asc" } }, { sortOrder: "asc" }],
    include: {
      item: {
        select: {
          id: true,
          name: true,
          kind: true,
          unit: true,
          salePrice: true,
          vatRate: true,
          trackStock: true,
          durationMinutes: true,
          imageUrl: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });

  const stock = await getStockLevels(
    variants.filter((v) => v.item.trackStock).map((v) => v.id),
    branchId,
  );

  return variants.map((variant) => ({
    variantId: variant.id,
    itemId: variant.item.id,
    name: variant.item.name,
    variantName: variant.name && variant.name !== variant.item.name ? variant.name : null,
    kind: variant.item.kind,
    unit: variant.item.unit,
    durationMinutes: variant.item.durationMinutes,
    sku: variant.sku,
    barcode: variant.barcode,
    plu: variant.plu,
    price: variant.salePrice === null ? num(variant.item.salePrice) : num(variant.salePrice),
    vatRate: variant.item.vatRate === null ? null : num(variant.item.vatRate),
    categoryId: variant.item.category?.id ?? null,
    categoryName: variant.item.category?.name ?? null,
    imageUrl: variant.item.imageUrl,
    trackStock: variant.item.trackStock,
    stock: variant.item.trackStock ? (stock.get(variant.id) ?? 0) : null,
  }));
}

export type RegisterItem = Awaited<ReturnType<typeof listRegisterItems>>[number];

export async function listRegisters(branchId: string, options?: { activeOnly?: boolean }) {
  return db.posRegister.findMany({
    where: { branchId, ...(options?.activeOnly ? { isActive: true } : {}) },
    orderBy: { name: "asc" },
    include: {
      cashAccount: { select: { id: true, name: true } },
      shifts: { where: { status: "OPEN" }, orderBy: { openedAt: "desc" }, take: 1 },
    },
  });
}

export type RegisterRow = Awaited<ReturnType<typeof listRegisters>>[number];

export async function getRegister(registerId: string) {
  return db.posRegister.findUnique({ where: { id: registerId }, include: { cashAccount: { select: { id: true, name: true } } } });
}

/** Sales held at this branch, so a till can pick one back up. */
export async function listParkedSales(branchId: string) {
  const sales = await db.posSale.findMany({
    where: { branchId, status: "PARKED" },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      items: { orderBy: { sortOrder: "asc" }, include: { modifiers: { orderBy: { sortOrder: "asc" } } } },
      customer: { select: { name: true } },
    },
  });
  return sales.map((sale) => ({
    id: sale.id,
    number: sale.number,
    customerName: sale.customer?.name ?? null,
    createdAt: sale.createdAt,
    cashierName: sale.cashierName,
    total: num(sale.grandTotal),
    itemCount: sale.items.length,
    cartDiscountPercent: num(sale.cartDiscountPercent),
    note: sale.note,
    lines: sale.items.map((item) => ({
      variantId: item.variantId,
      name: item.name,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      /** Already includes any whole-sale discount, so it travels with the line. */
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
      unit: item.unit,
      // Without these a held sale would come back without the options the customer chose. An
      // option whose row is gone cannot be priced again, so it is left out of what goes back.
      modifiers: item.modifiers
        .filter((modifier): modifier is typeof modifier & { optionId: string } => modifier.optionId !== null)
        .map((modifier) => ({
          optionId: modifier.optionId,
          groupName: modifier.groupName,
          optionName: modifier.optionName,
          priceDelta: num(modifier.priceDelta),
        })),
    })),
  }));
}

export type ParkedSale = Awaited<ReturnType<typeof listParkedSales>>[number];

const SALE_FILTERS: Record<string, Prisma.PosSaleWhereInput> = {
  completed: { status: "COMPLETED" },
  held: { status: "PARKED" },
  voided: { status: "VOIDED" },
  refunded: { status: { in: ["REFUNDED", "PARTIALLY_REFUNDED"] } },
};

export async function listSales(params: ListParams, branchId?: string) {
  const where: Prisma.PosSaleWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(SALE_FILTERS[params.filter] ?? {}),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: "insensitive" } },
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
            { cashierName: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const soldOnly = { ...where, status: { in: ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] } } satisfies Prisma.PosSaleWhereInput;
  const [rows, total, sum, returned] = await Promise.all([
    db.posSale.findMany({
      where,
      orderBy: { soldAt: "desc" },
      ...paginate(params),
      include: {
        customer: { select: { id: true, name: true } },
        branch: { select: { name: true } },
        register: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.posSale.count({ where }),
    db.posSale.aggregate({ where: soldOnly, _sum: { grandTotal: true, costTotal: true, refundedTotal: true } }),
    // Returned cost comes off cost of goods, so margin reverses with the goods.
    db.posReturn.aggregate({ where: { sale: soldOnly }, _sum: { costTotal: true } }),
  ]);

  return {
    sales: rows.map((sale) => ({
      id: sale.id,
      number: sale.number,
      status: sale.status,
      soldAt: sale.soldAt,
      customerName: sale.customer?.name ?? null,
      customerId: sale.customer?.id ?? null,
      branchName: sale.branch.name,
      registerName: sale.register?.name ?? null,
      cashierName: sale.cashierName,
      itemCount: sale._count.items,
      total: num(sale.grandTotal),
      paid: num(sale.paidTotal),
    })),
    total,
    // Gross takings, what went back, and what the business actually kept.
    takings: num(sum._sum.grandTotal),
    refunds: num(sum._sum.refundedTotal),
    netSales: round2(num(sum._sum.grandTotal) - num(sum._sum.refundedTotal)),
    cost: round2(num(sum._sum.costTotal) - num(returned._sum.costTotal)),
  };
}

export type SaleListRow = Awaited<ReturnType<typeof listSales>>["sales"][number];

export async function getSale(saleId: string) {
  const sale = await db.posSale.findUnique({
    where: { id: saleId },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: { modifiers: { orderBy: { sortOrder: "asc" } }, ingredients: { orderBy: { sortOrder: "asc" } } },
      },
      payments: { include: { paymentAccount: { select: { name: true } } } },
      customer: { select: { id: true, name: true, phone: true, vatNumber: true } },
      branch: { select: { name: true, address: true, phone: true, vatNumber: true } },
      register: { select: { name: true } },
      table: { select: { name: true } },
      returns: { orderBy: { returnedAt: "desc" }, include: { items: true } },
    },
  });
  if (!sale) return null;
  return {
    ...sale,
    subtotal: num(sale.subtotal),
    discountTotal: num(sale.discountTotal),
    vatTotal: num(sale.vatTotal),
    grandTotal: num(sale.grandTotal),
    costTotal: num(sale.costTotal),
    paidTotal: num(sale.paidTotal),
    changeDue: num(sale.changeDue),
    cartDiscountPercent: num(sale.cartDiscountPercent),
    refundedTotal: num(sale.refundedTotal),
    items: sale.items.map((item) => ({
      ...item,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      unitCost: num(item.unitCost),
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
      lineSubtotal: num(item.lineSubtotal),
      lineDiscount: num(item.lineDiscount),
      lineVat: num(item.lineVat),
      lineTotal: num(item.lineTotal),
      modifiers: item.modifiers.map((modifier) => ({
        id: modifier.id,
        groupName: modifier.groupName,
        optionName: modifier.optionName,
        priceDelta: num(modifier.priceDelta),
      })),
      /** What this line took out of stock, from its own snapshot — recipes only. */
      ingredients: item.ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        unit: ingredient.unit,
        quantity: num(ingredient.quantity),
        cost: round2(num(ingredient.quantity) * num(ingredient.unitCost)),
      })),
    })),
    payments: sale.payments.map((payment) => ({
      ...payment,
      amount: num(payment.amount),
      accountName: payment.paymentAccount.name,
      isRefund: payment.returnId !== null,
    })),
    returns: sale.returns.map((row) => ({
      id: row.id,
      number: row.number,
      returnedAt: row.returnedAt,
      grandTotal: num(row.grandTotal),
      reason: row.reason,
      restock: row.restock,
      userName: row.userName,
      itemCount: row.items.length,
    })),
  };
}

export type SaleDetail = NonNullable<Awaited<ReturnType<typeof getSale>>>;

export async function listShifts(params: ListParams, branchId?: string) {
  const where: Prisma.PosShiftWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(params.filter === "open" ? { status: "OPEN" } : params.filter === "closed" ? { status: "CLOSED" } : {}),
  };
  const [rows, total] = await Promise.all([
    db.posShift.findMany({
      where,
      orderBy: { openedAt: "desc" },
      ...paginate(params),
      include: { register: { select: { name: true } }, branch: { select: { name: true } }, _count: { select: { sales: true } } },
    }),
    db.posShift.count({ where }),
  ]);
  return {
    shifts: rows.map((shift) => ({
      id: shift.id,
      registerName: shift.register.name,
      branchName: shift.branch.name,
      status: shift.status,
      openedAt: shift.openedAt,
      openedByName: shift.openedByName,
      closedAt: shift.closedAt,
      closedByName: shift.closedByName,
      openingCash: num(shift.openingCash),
      closingCash: shift.closingCash === null ? null : num(shift.closingCash),
      expectedCash: shift.expectedCash === null ? null : num(shift.expectedCash),
      variance: shift.variance === null ? null : num(shift.variance),
      saleCount: shift._count.sales,
    })),
    total,
  };
}

export type ShiftRow = Awaited<ReturnType<typeof listShifts>>["shifts"][number];

export async function listShiftCashMovements(shiftId: string) {
  const rows = await db.posCashMovement.findMany({ where: { shiftId }, orderBy: { createdAt: "desc" } });
  return rows.map((row) => ({ ...row, amount: num(row.amount) }));
}

/** Returns across the branch, newest first, with what was refunded. */
export async function listReturns(params: ListParams, branchId?: string) {
  const where: Prisma.PosReturnWhereInput = {
    ...(branchId ? { branchId } : {}),
    ...(params.filter === "restocked" ? { restock: true } : params.filter === "written-off" ? { restock: false } : {}),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: "insensitive" } },
            { sale: { number: { contains: params.q, mode: "insensitive" } } },
            { userName: { contains: params.q, mode: "insensitive" } },
            { reason: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, sum] = await Promise.all([
    db.posReturn.findMany({
      where,
      orderBy: { returnedAt: "desc" },
      ...paginate(params),
      include: {
        sale: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
        register: { select: { name: true } },
        _count: { select: { items: true } },
      },
    }),
    db.posReturn.count({ where }),
    db.posReturn.aggregate({ where, _sum: { grandTotal: true, costTotal: true } }),
  ]);

  return {
    returns: rows.map((row) => ({
      id: row.id,
      number: row.number,
      saleId: row.sale.id,
      saleNumber: row.sale.number,
      customerName: row.sale.customer?.name ?? null,
      customerId: row.sale.customer?.id ?? null,
      registerName: row.register?.name ?? null,
      returnedAt: row.returnedAt,
      grandTotal: num(row.grandTotal),
      reason: row.reason,
      restock: row.restock,
      userName: row.userName,
      itemCount: row._count.items,
    })),
    total,
    refunded: num(sum._sum.grandTotal),
    cost: num(sum._sum.costTotal),
  };
}

export type ReturnListRow = Awaited<ReturnType<typeof listReturns>>["returns"][number];

/**
 * How today is going at one branch: the figures the Overview page answers "what is happening here"
 * with. Each count is only *shown* where the branch's industry has the feature, but reading them
 * is cheap and keeps the page to one query round.
 */
export async function posTodaySummary(branchId: string, todayDate: string) {
  const day = new Date(`${todayDate}T00:00:00.000Z`);
  const soldStatuses = ["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

  const [sold, refunded, openShift, parked, tickets, bookings, jobs, rentalsOut, staying] = await Promise.all([
    db.posSale.aggregate({ where: { branchId, date: day, status: { in: [...soldStatuses] } }, _sum: { grandTotal: true }, _count: true }),
    db.posReturn.aggregate({ where: { branchId, date: day }, _sum: { grandTotal: true } }),
    db.posShift.findFirst({
      where: { branchId, status: "OPEN" },
      orderBy: { openedAt: "desc" },
      select: { openedByName: true, openedAt: true, register: { select: { name: true } } },
    }),
    db.posSale.findMany({ where: { branchId, status: "PARKED" }, select: { tableId: true, tabName: true } }),
    db.posKitchenTicket.count({ where: { branchId, status: { in: ["NEW", "PREPARING", "READY"] } } }),
    db.appointment.count({ where: { branchId, startAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) }, status: { notIn: ["CANCELLED"] } } }),
    db.workOrder.count({ where: { branchId, status: { notIn: ["DELIVERED", "CANCELLED"] } } }),
    db.rental.count({ where: { branchId, status: { in: ["OUT", "OVERDUE"] } } }),
    db.stay.count({ where: { branchId, status: "CHECKED_IN" } }),
  ]);

  const takings = num(sold._sum.grandTotal);
  const given = num(refunded._sum.grandTotal);
  return {
    saleCount: sold._count,
    takings,
    refunds: given,
    netTakings: round2(takings - given),
    openShift: openShift ? { register: openShift.register.name, by: openShift.openedByName, since: openShift.openedAt } : null,
    /** Held bills, split the way the industry would name them. */
    openTables: parked.filter((sale) => sale.tableId !== null).length,
    openTabs: parked.filter((sale) => sale.tableId === null && sale.tabName !== null).length,
    heldSales: parked.filter((sale) => sale.tableId === null && sale.tabName === null).length,
    kitchenTickets: tickets,
    bookingsToday: bookings,
    openJobs: jobs,
    rentalsOut,
    guestsIn: staying,
  };
}

export type PosTodaySummary = Awaited<ReturnType<typeof posTodaySummary>>;
