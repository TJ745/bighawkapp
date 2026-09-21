"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { assertSupplierUsable } from "@/lib/business/procurement";
import { buildItemRows, enforceVatPolicy, readDocumentFormData, storeAttachments } from "@/lib/business/sales";
import { getSupplierQuotation } from "@/lib/data/procurement";
import { today } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";
import { addDays, parseDateOnly } from "@/lib/dates";
import { deleteStoredFile } from "@/lib/storage";
import { supplierQuotationSchema } from "@/lib/validation/procurement";

const LIST_PATH = "/procurement/supplier-quotations";

function revalidate(id?: string, supplierId?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath("/procurement/suppliers");
  if (supplierId) revalidatePath(`/procurement/suppliers/${supplierId}`);
}

async function loadEditable(id: string) {
  const q = await db.supplierQuotation.findUnique({ where: { id }, include: { purchase: { select: { id: true } } } });
  if (!q) throw new BusinessError("Supplier quotation not found.");
  if (q.purchase) throw new BusinessError("This quotation has been converted to a purchase and can no longer change.");
  return q;
}

export async function createSupplierQuotation(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "create");
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(supplierQuotationSchema, payload);
    await assertSupplierUsable(input.supplierId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));

    const created = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "SUPPLIER_QUOTATION", parseDateOnly(input.date));
      return tx.supplierQuotation.create({
        data: {
          number,
          supplierId: input.supplierId,
          supplierReference: input.supplierReference,
          date: parseDateOnly(input.date),
          validUntil: input.validUntil ? parseDateOnly(input.validUntil) : null,
          notes: input.notes,
          ...totals,
          createdById: auth.user.id,
          items: { create: rows },
        },
      });
    });
    const attachments = await storeAttachments(`supplier-quotations/${created.id}`, files);
    if (attachments.length) {
      await db.supplierQuotationAttachment.createMany({ data: attachments.map((a) => ({ ...a, supplierQuotationId: created.id })) });
    }
    revalidate(created.id, input.supplierId);
    return { id: created.id };
  });
}

export async function updateSupplierQuotation(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "edit");
    const existing = await loadEditable(id);
    if (existing.status === "ACCEPTED" || existing.status === "REJECTED") {
      throw new BusinessError("Accepted or rejected quotations cannot be edited.");
    }
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(supplierQuotationSchema, payload);
    await assertSupplierUsable(input.supplierId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));

    await db.$transaction(async (tx) => {
      await tx.supplierQuotationItem.deleteMany({ where: { supplierQuotationId: id } });
      await tx.supplierQuotation.update({
        where: { id },
        data: {
          supplierId: input.supplierId,
          supplierReference: input.supplierReference,
          date: parseDateOnly(input.date),
          validUntil: input.validUntil ? parseDateOnly(input.validUntil) : null,
          notes: input.notes,
          ...totals,
          // An expired quotation that gets a new validity date is live again.
          status: existing.status === "EXPIRED" ? "DRAFT" : existing.status,
          items: { create: rows },
        },
      });
    });
    const attachments = await storeAttachments(`supplier-quotations/${id}`, files);
    if (attachments.length) {
      await db.supplierQuotationAttachment.createMany({ data: attachments.map((a) => ({ ...a, supplierQuotationId: id })) });
    }
    revalidate(id, input.supplierId);
  });
}

export async function deleteSupplierQuotationAttachment(id: string, attachmentId: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "edit");
    const attachment = await db.supplierQuotationAttachment.findFirst({ where: { id: attachmentId, supplierQuotationId: id } });
    if (!attachment) throw new BusinessError("Attachment not found.");
    await db.supplierQuotationAttachment.delete({ where: { id: attachmentId } });
    await deleteStoredFile(attachment.fileKey);
    revalidate(id);
  });
}

/** The supplier's offer is complete and on file. */
export async function markSupplierQuotationReceived(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "edit");
    const q = await loadEditable(id);
    if (q.status !== "DRAFT") throw new BusinessError("Only draft quotations can be marked as received.");
    await db.supplierQuotation.update({ where: { id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    revalidate(id, q.supplierId);
  });
}

export async function decideSupplierQuotation(id: string, decision: "ACCEPTED" | "REJECTED"): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("PROCUREMENT", "edit");
    if (decision !== "ACCEPTED" && decision !== "REJECTED") throw new BusinessError("Invalid decision.");
    const q = await loadEditable(id);
    if (q.status === "ACCEPTED" || q.status === "REJECTED") throw new BusinessError("This quotation has already been decided.");
    await db.supplierQuotation.update({ where: { id }, data: { status: decision, decidedAt: new Date() } });
    revalidate(id, q.supplierId);
  });
}

export async function convertSupplierQuotationToPurchase(id: string): Promise<ActionResult<{ purchaseId: string }>> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "create");
    const q = await getSupplierQuotation(id);
    if (!q) throw new BusinessError("Supplier quotation not found.");
    if (q.purchase) throw new BusinessError(`Already converted to purchase ${q.purchase.number}.`);
    if (q.status !== "ACCEPTED") throw new BusinessError("Only accepted supplier quotations can be converted to a purchase.");
    await assertSupplierUsable(q.supplierId);

    const settings = await getAppSettings();
    const date = await today();
    const termDays = settings.defaultPaymentTermDays;
    const { rows, totals } = buildItemRows(q.items);

    const purchase = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PURCHASE", parseDateOnly(date));
      return tx.purchase.create({
        data: {
          number,
          supplierId: q.supplierId,
          supplierQuotationId: q.id,
          supplierReference: q.supplierReference,
          date: parseDateOnly(date),
          paymentTermDays: termDays,
          dueDate: parseDateOnly(addDays(date, termDays)),
          ...totals,
          notes: q.notes,
          createdById: auth.user.id,
          items: { create: rows },
        },
      });
    });

    revalidate(id, q.supplierId);
    revalidatePath("/procurement/purchases");
    return { purchaseId: purchase.id };
  });
}
