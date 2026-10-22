import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";

/** Reads for the goods receipts on a purchase. */

export async function listReceiptsForPurchase(purchaseId: string) {
  const rows = await db.purchaseReceipt.findMany({
    where: { purchaseId },
    orderBy: [{ receivedAt: "desc" }],
    include: { branch: { select: { name: true } }, items: { orderBy: { sortOrder: "asc" } } },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    date: row.date,
    receivedAt: row.receivedAt,
    branchName: row.branch.name,
    receivedByName: row.receivedByName,
    status: row.status,
    note: row.note,
    cancelReason: row.cancelReason,
    lines: row.items.map((item) => ({
      id: item.id,
      name: item.name,
      unit: item.unit,
      quantity: num(item.quantity),
      unitCost: num(item.unitCost),
      value: Math.round(num(item.quantity) * num(item.unitCost) * 100) / 100,
    })),
    /** What this delivery was worth at cost — what it added to stock value. */
    value: row.items.reduce((sum, item) => sum + num(item.quantity) * num(item.unitCost), 0),
  }));
}

export type PurchaseReceiptRow = Awaited<ReturnType<typeof listReceiptsForPurchase>>[number];

/** Items a purchase line can be linked to: stocked products, with what is on the shelf now. */
export async function listReceivableItems(branchId: string) {
  const variants = await db.itemVariant.findMany({
    where: { isActive: true, item: { isActive: true, kind: "PRODUCT" } },
    orderBy: [{ item: { name: "asc" } }, { sortOrder: "asc" }],
    include: {
      item: { select: { name: true, unit: true, trackStock: true } },
      stockLevels: { where: { branchId }, select: { quantity: true } },
    },
  });

  return variants.map((variant) => ({
    variantId: variant.id,
    name: variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name,
    sku: variant.sku,
    barcode: variant.barcode,
    unit: variant.item.unit,
    tracksStock: variant.item.trackStock,
    onHand: variant.item.trackStock ? num(variant.stockLevels[0]?.quantity ?? 0) : null,
  }));
}

export type ReceivableItem = Awaited<ReturnType<typeof listReceivableItems>>[number];
