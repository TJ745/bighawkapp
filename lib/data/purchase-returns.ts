import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";

/** Reads for goods sent back to a supplier. */

/** Every return raised against a purchase, newest first, with what went back on each. */
export async function listReturnsForPurchase(purchaseId: string) {
  const rows = await db.purchaseReturn.findMany({
    where: { purchaseId },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    include: { branch: { select: { name: true } }, items: { orderBy: { sortOrder: "asc" } } },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    date: row.date,
    branchName: row.branch.name,
    status: row.status,
    reason: row.reason,
    cancelReason: row.cancelReason,
    createdByName: row.createdByName,
    grandTotal: num(row.grandTotal),
    refundedTotal: num(row.refundedTotal),
    lines: row.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: num(item.quantity),
      lineTotal: num(item.lineTotal),
    })),
  }));
}

export type PurchaseReturnRow = Awaited<ReturnType<typeof listReturnsForPurchase>>[number];

/** One return, with everything a document needs to be printed and sent to the supplier. */
export async function getPurchaseReturn(id: string) {
  const row = await db.purchaseReturn.findUnique({
    where: { id },
    include: {
      supplier: true,
      branch: { select: { name: true } },
      purchase: { select: { id: true, number: true, date: true } },
      items: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!row) return null;

  return {
    id: row.id,
    number: row.number,
    date: row.date,
    status: row.status,
    reason: row.reason,
    cancelReason: row.cancelReason,
    branchName: row.branch.name,
    createdByName: row.createdByName,
    supplier: row.supplier,
    purchase: row.purchase,
    subtotal: num(row.subtotal),
    discountTotal: num(row.discountTotal),
    vatTotal: num(row.vatTotal),
    grandTotal: num(row.grandTotal),
    refundedTotal: num(row.refundedTotal),
    // The same shape every other printed document uses, so it goes through the shared builders.
    items: row.items.map((item) => ({
      id: item.id,
      sortOrder: item.sortOrder,
      description: item.description,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
      lineSubtotal: num(item.lineSubtotal),
      lineDiscount: num(item.lineDiscount),
      lineVat: num(item.lineVat),
      lineTotal: num(item.lineTotal),
    })),
  };
}

export type PurchaseReturnDetail = NonNullable<Awaited<ReturnType<typeof getPurchaseReturn>>>;
