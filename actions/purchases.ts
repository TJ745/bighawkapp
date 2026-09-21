"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { assertOptionalLinks, assertSupplierUsable, refreshPurchase } from "@/lib/business/procurement";
import { buildItemRows, enforceVatPolicy, readDocumentFormData, storeAttachments } from "@/lib/business/sales";
import { round2 } from "@/lib/business/totals";
import { getPurchase } from "@/lib/data/procurement";
import { num } from "@/lib/decimal";
import { parseDateOnly } from "@/lib/dates";
import { deleteStoredFile } from "@/lib/storage";
import { purchaseSchema } from "@/lib/validation/procurement";
import { invoicePaymentSchema } from "@/lib/validation/sales";

const LIST_PATH = "/procurement/purchases";

function revalidate(id?: string, supplierId?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath("/procurement/suppliers");
  if (supplierId) revalidatePath(`/procurement/suppliers/${supplierId}`);
  revalidatePath("/projects", "layout");
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
}

export async function createPurchase(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "create");
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(purchaseSchema, payload);
    await assertSupplierUsable(input.supplierId);
    await assertOptionalLinks(input.customerId, input.projectId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));

    const purchase = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PURCHASE", parseDateOnly(input.date));
      return tx.purchase.create({
        data: {
          number,
          supplierId: input.supplierId,
          supplierReference: input.supplierReference,
          customerId: input.customerId,
          projectId: input.projectId,
          date: parseDateOnly(input.date),
          paymentTermDays: input.paymentTermDays,
          dueDate: parseDateOnly(input.dueDate),
          ...totals,
          notes: input.notes,
          createdById: auth.user.id,
          items: { create: rows },
        },
      });
    });
    const attachments = await storeAttachments(`purchases/${purchase.id}`, files);
    if (attachments.length) await db.purchaseAttachment.createMany({ data: attachments.map((a) => ({ ...a, purchaseId: purchase.id })) });

    revalidate(purchase.id, input.supplierId);
    return { id: purchase.id };
  });
}

export async function updatePurchase(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "edit");
    const existing = await db.purchase.findUnique({ where: { id }, select: { paidTotal: true } });
    if (!existing) throw new BusinessError("Purchase not found.");
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(purchaseSchema, payload);
    await assertSupplierUsable(input.supplierId);
    await assertOptionalLinks(input.customerId, input.projectId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));
    if (num(existing.paidTotal) > totals.grandTotal) {
      throw new BusinessError("The total cannot be lower than the amount already paid on this purchase.");
    }

    await db.$transaction(async (tx) => {
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      await tx.purchase.update({
        where: { id },
        data: {
          supplierId: input.supplierId,
          supplierReference: input.supplierReference,
          customerId: input.customerId,
          projectId: input.projectId,
          date: parseDateOnly(input.date),
          paymentTermDays: input.paymentTermDays,
          dueDate: parseDateOnly(input.dueDate),
          ...totals,
          notes: input.notes,
          items: { create: rows },
        },
      });
      await refreshPurchase(tx, id);
    });
    const attachments = await storeAttachments(`purchases/${id}`, files);
    if (attachments.length) await db.purchaseAttachment.createMany({ data: attachments.map((a) => ({ ...a, purchaseId: id })) });

    revalidate(id, input.supplierId);
  });
}

export async function deletePurchaseAttachment(id: string, attachmentId: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "edit");
    const attachment = await db.purchaseAttachment.findFirst({ where: { id: attachmentId, purchaseId: id } });
    if (!attachment) throw new BusinessError("Attachment not found.");
    await db.purchaseAttachment.delete({ where: { id: attachmentId } });
    await deleteStoredFile(attachment.fileKey);
    revalidate(id);
  });
}

/** Goods/services were received from the supplier; the purchase now counts towards payables. */
export async function markPurchaseReceived(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "edit");
    const p = await db.purchase.findUnique({ where: { id }, select: { receivedAt: true, supplierId: true } });
    if (!p) throw new BusinessError("Purchase not found.");
    if (p.receivedAt) throw new BusinessError("This purchase is already marked as received.");
    await db.$transaction(async (tx) => {
      await tx.purchase.update({ where: { id }, data: { receivedAt: new Date() } });
      await refreshPurchase(tx, id);
    });
    revalidate(id, p.supplierId);
  });
}

export async function recordPurchasePayment(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "edit");
    const data = parseInput(invoicePaymentSchema, input);
    const p = await getPurchase(id);
    if (!p) throw new BusinessError("Purchase not found.");
    if (p.remaining <= 0) throw new BusinessError("This purchase is already fully paid.");
    if (data.amount > p.remaining + 0.005) throw new BusinessError("The payment is more than the remaining balance on this purchase.");
    const account = await db.paymentAccount.findUnique({ where: { id: data.paymentAccountId }, select: { isActive: true } });
    if (!account?.isActive) throw new BusinessError("Choose an active payment account.");

    await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PAYMENT", parseDateOnly(data.date));
      await tx.purchasePayment.create({
        data: {
          number,
          purchaseId: id,
          amount: round2(data.amount),
          date: parseDateOnly(data.date),
          paymentAccountId: data.paymentAccountId,
          reference: data.reference,
          notes: data.notes,
          createdById: auth.user.id,
        },
      });
      // Paying implies the purchase was received.
      await tx.purchase.updateMany({ where: { id, receivedAt: null }, data: { receivedAt: new Date() } });
      await refreshPurchase(tx, id);
    });

    revalidate(id, p.supplierId);
  });
}
