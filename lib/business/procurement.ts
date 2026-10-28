import "server-only";
import { BusinessError } from "@/lib/auth/errors";
import { db, type Tx } from "@/lib/db";
import { num } from "@/lib/decimal";
import { today } from "@/lib/data/sales";
import { derivePurchaseStatus } from "./procurement-status";
import { round2 } from "./totals";

export async function assertSupplierUsable(supplierId: string) {
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { id: true, isActive: true } });
  if (!supplier) throw new BusinessError("Supplier not found.");
  if (!supplier.isActive) throw new BusinessError("This supplier is inactive. Activate them first.");
}

export async function assertOptionalLinks(customerId: string | null, projectId: string | null) {
  if (customerId) {
    const c = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!c) throw new BusinessError("The linked customer no longer exists.");
  }
  if (projectId) {
    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new BusinessError("The linked project no longer exists.");
  }
}

/** Recomputes and stores paidTotal + status from the purchase's payments. The one place status is set. */
export async function refreshPurchase(tx: Tx, id: string) {
  const p = await tx.purchase.findUniqueOrThrow({
    where: { id },
    select: { receivedAt: true, supplierReference: true, dueDate: true, grandTotal: true },
  });
  /**
   * Payments include the negative rows a return produced, so this is the money actually gone.
   * Returns are counted separately: goods going back settle a purchase with no money moving.
   */
  const sum = await tx.purchasePayment.aggregate({ where: { purchaseId: id }, _sum: { amount: true } });
  const paidTotal = round2(num(sum._sum.amount));
  const credited = await tx.purchaseReturn.aggregate({ where: { purchaseId: id, status: "ISSUED" }, _sum: { grandTotal: true } });
  const creditedTotal = round2(num(credited._sum.grandTotal));
  const status = derivePurchaseStatus({ ...p, grandTotal: num(p.grandTotal), paidTotal, creditedTotal }, await today());
  await tx.purchase.update({ where: { id }, data: { paidTotal, creditedTotal, status } });
  return { paidTotal, creditedTotal, status };
}
