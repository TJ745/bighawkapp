import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { BusinessError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
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
export async function refreshPurchase(tx: Prisma.TransactionClient, id: string) {
  const p = await tx.purchase.findUniqueOrThrow({
    where: { id },
    select: { receivedAt: true, supplierReference: true, dueDate: true, grandTotal: true },
  });
  const sum = await tx.purchasePayment.aggregate({ where: { purchaseId: id }, _sum: { amount: true } });
  const paidTotal = round2(num(sum._sum.amount));
  const status = derivePurchaseStatus({ ...p, grandTotal: num(p.grandTotal), paidTotal }, await today());
  await tx.purchase.update({ where: { id }, data: { paidTotal, status } });
  return { paidTotal, status };
}
