"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { assertCustomerUsable, assertProjectForCustomer, buildItemRows, enforceVatPolicy, readDocumentFormData, storeAttachments } from "@/lib/business/sales";
import { calcDeposit } from "@/lib/business/totals";
import { getQuotation, today } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";
import { addDays, parseDateOnly } from "@/lib/dates";
import { renderEmailTemplate, sendEmail } from "@/lib/email/mailer";
import { renderQuotationPdf } from "@/lib/pdf/sales";
import { notify } from "@/lib/notifications/notify";
import { deleteStoredFile } from "@/lib/storage";
import { quotationSchema, sendDocumentSchema } from "@/lib/validation/sales";
import { getFormatters } from "@/lib/settings/formatters";
import { num } from "@/lib/decimal";

const LIST_PATH = "/sales/quotations";

function revalidate(id?: string, customerId?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

async function loadEditable(id: string) {
  const q = await db.quotation.findUnique({ where: { id }, include: { invoice: { select: { id: true } } } });
  if (!q) throw new BusinessError("Quotation not found.");
  if (q.invoice) throw new BusinessError("This quotation has been converted to an invoice and can no longer change.");
  return q;
}

export async function createQuotation(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "create");
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(quotationSchema, payload);
    await assertCustomerUsable(input.customerId);
    await assertProjectForCustomer(input.projectId, input.customerId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));

    const quotation = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "QUOTATION", parseDateOnly(input.date));
      return tx.quotation.create({
        data: {
          number,
          customerId: input.customerId,
          projectId: input.projectId,
          date: parseDateOnly(input.date),
          validUntil: input.validUntil ? parseDateOnly(input.validUntil) : null,
          terms: input.terms,
          ...totals,
          createdById: auth.user.id,
          items: { create: rows },
        },
      });
    });
    const attachments = await storeAttachments(`quotations/${quotation.id}`, files);
    if (attachments.length) await db.quotationAttachment.createMany({ data: attachments.map((a) => ({ ...a, quotationId: quotation.id })) });

    revalidate(quotation.id, input.customerId);
    return { id: quotation.id };
  });
}

export async function updateQuotation(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const existing = await loadEditable(id);
    if (existing.status === "ACCEPTED" || existing.status === "REJECTED") {
      throw new BusinessError("Accepted or rejected quotations cannot be edited.");
    }
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(quotationSchema, payload);
    await assertCustomerUsable(input.customerId);
    await assertProjectForCustomer(input.projectId, input.customerId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));

    await db.$transaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      await tx.quotation.update({
        where: { id },
        data: {
          customerId: input.customerId,
          projectId: input.projectId,
          date: parseDateOnly(input.date),
          validUntil: input.validUntil ? parseDateOnly(input.validUntil) : null,
          terms: input.terms,
          ...totals,
          // Changing a sent/expired quotation produces a new version that must be sent again.
          status: "DRAFT",
          items: { create: rows },
        },
      });
    });
    const attachments = await storeAttachments(`quotations/${id}`, files);
    if (attachments.length) await db.quotationAttachment.createMany({ data: attachments.map((a) => ({ ...a, quotationId: id })) });

    revalidate(id, input.customerId);
  });
}

export async function deleteQuotationAttachment(id: string, attachmentId: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const attachment = await db.quotationAttachment.findFirst({ where: { id: attachmentId, quotationId: id } });
    if (!attachment) throw new BusinessError("Attachment not found.");
    await db.quotationAttachment.delete({ where: { id: attachmentId } });
    await deleteStoredFile(attachment.fileKey);
    revalidate(id);
  });
}

/** Default email content for the send dialog (from Settings → email templates). */
export async function prepareQuotationEmail(id: string): Promise<ActionResult<{ to: string; subject: string; body: string }>> {
  return runAction(async () => {
    await authorize("SALES", "view");
    const q = await getQuotation(id);
    if (!q) throw new BusinessError("Quotation not found.");
    const f = await getFormatters();
    const rendered = await renderEmailTemplate("QUOTATION", {
      recipient_name: q.customer.contactPerson ?? q.customer.name,
      document_number: q.number,
      document_date: f.date(q.date),
      valid_until: q.validUntil ? f.date(q.validUntil) : "",
      total: f.money(q.grandTotal),
    });
    return { to: q.customer.email ?? "", subject: rendered.subject, body: rendered.text };
  });
}

export async function sendQuotation(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const message = parseInput(sendDocumentSchema, input);
    const q = await getQuotation(id);
    if (!q) throw new BusinessError("Quotation not found.");
    if (q.status === "ACCEPTED" || q.status === "REJECTED") throw new BusinessError("This quotation has already been decided.");
    if (q.items.length === 0) throw new BusinessError("Add at least one item before sending.");

    const pdf = await renderQuotationPdf(q);
    await sendEmail({
      to: message.to,
      subject: message.subject,
      text: message.body,
      attachments: [{ filename: `${q.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    await db.quotation.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    revalidate(id, q.customerId);
  });
}

/** For customers without email: the PDF was printed/handed over, so the quotation counts as sent. */
export async function markQuotationSent(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const q = await loadEditable(id);
    if (q.status !== "DRAFT" && q.status !== "EXPIRED") throw new BusinessError("Only draft quotations can be marked as sent.");
    await db.quotation.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
    revalidate(id, q.customerId);
  });
}

export async function decideQuotation(id: string, decision: "ACCEPTED" | "REJECTED"): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    if (decision !== "ACCEPTED" && decision !== "REJECTED") throw new BusinessError("Invalid decision.");
    const q = await loadEditable(id);
    if (q.status === "ACCEPTED" || q.status === "REJECTED") throw new BusinessError("This quotation has already been decided.");
    await db.quotation.update({ where: { id }, data: { status: decision, decidedAt: new Date() } });
    if (decision === "ACCEPTED") {
      const [customer, f] = await Promise.all([db.customer.findUnique({ where: { id: q.customerId }, select: { name: true } }), getFormatters()]);
      await notify({
        type: "QUOTATION_ACCEPTED",
        title: `Quotation ${q.number} accepted`,
        message: `${customer?.name ?? "The customer"} accepted ${q.number} (${f.money(num(q.grandTotal))}). It can now be converted to an invoice.`,
        link: `/sales/quotations/${id}`,
      });
    }
    revalidate(id, q.customerId);
  });
}

export async function convertQuotationToInvoice(id: string): Promise<ActionResult<{ invoiceId: string }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "create");
    const q = await getQuotation(id);
    if (!q) throw new BusinessError("Quotation not found.");
    if (q.invoice) throw new BusinessError(`Already converted to invoice ${q.invoice.number}.`);
    if (q.status !== "ACCEPTED") throw new BusinessError("Only accepted quotations can be converted to an invoice.");
    await assertCustomerUsable(q.customerId);

    const settings = await getAppSettings();
    const date = await today();
    const depositPercent = settings.defaultDepositPercent;
    const termDays = depositPercent > 0 ? settings.defaultRemainingDueDays : settings.defaultPaymentTermDays;
    const { rows, totals } = buildItemRows(q.items);

    const invoice = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "INVOICE", parseDateOnly(date));
      return tx.invoice.create({
        data: {
          number,
          customerId: q.customerId,
          projectId: q.projectId,
          quotationId: q.id,
          date: parseDateOnly(date),
          paymentTermDays: termDays,
          dueDate: parseDateOnly(addDays(date, termDays)),
          depositPercent,
          depositAmount: calcDeposit(totals.grandTotal, depositPercent),
          ...totals,
          terms: q.terms ?? (settings.invoiceTerms || null),
          createdById: auth.user.id,
          items: { create: rows },
        },
      });
    });

    revalidate(id, q.customerId);
    revalidatePath("/sales/invoices");
    return { invoiceId: invoice.id };
  });
}
