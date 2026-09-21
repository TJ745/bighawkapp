"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { assertCustomerUsable, assertProjectForCustomer, buildItemRows, enforceVatPolicy, readDocumentFormData, refreshInvoice, storeAttachments } from "@/lib/business/sales";
import { calcDeposit, round2 } from "@/lib/business/totals";
import { getInvoice } from "@/lib/data/sales";
import { num } from "@/lib/decimal";
import { parseDateOnly } from "@/lib/dates";
import { renderEmailTemplate, sendEmail } from "@/lib/email/mailer";
import { renderInvoicePdf } from "@/lib/pdf/sales";
import { getFormatters } from "@/lib/settings/formatters";
import { notify } from "@/lib/notifications/notify";
import { deleteStoredFile } from "@/lib/storage";
import { invoicePaymentSchema, invoiceSchema, sendDocumentSchema } from "@/lib/validation/sales";

const LIST_PATH = "/sales/invoices";

function revalidate(id?: string, customerId?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
}

export async function createInvoice(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "create");
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(invoiceSchema, payload);
    await assertCustomerUsable(input.customerId);
    await assertProjectForCustomer(input.projectId, input.customerId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));

    const invoice = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "INVOICE", parseDateOnly(input.date));
      return tx.invoice.create({
        data: {
          number,
          customerId: input.customerId,
          projectId: input.projectId,
          date: parseDateOnly(input.date),
          paymentTermDays: input.paymentTermDays,
          dueDate: parseDateOnly(input.dueDate),
          depositPercent: input.depositPercent,
          depositAmount: calcDeposit(totals.grandTotal, input.depositPercent),
          ...totals,
          terms: input.terms,
          internalNotes: input.internalNotes,
          createdById: auth.user.id,
          items: { create: rows },
        },
      });
    });
    const attachments = await storeAttachments(`invoices/${invoice.id}`, files);
    if (attachments.length) await db.invoiceAttachment.createMany({ data: attachments.map((a) => ({ ...a, invoiceId: invoice.id })) });

    revalidate(invoice.id, input.customerId);
    return { id: invoice.id };
  });
}

export async function updateInvoice(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const existing = await db.invoice.findUnique({ where: { id }, select: { paidTotal: true, status: true } });
    if (!existing) throw new BusinessError("Invoice not found.");
    const { payload, files } = readDocumentFormData(formData);
    const input = parseInput(invoiceSchema, payload);
    await assertCustomerUsable(input.customerId);
    await assertProjectForCustomer(input.projectId, input.customerId);
    const { rows, totals } = buildItemRows(await enforceVatPolicy(input.items));
    if (num(existing.paidTotal) > totals.grandTotal) {
      throw new BusinessError("The total cannot be lower than the amount already paid on this invoice.");
    }

    await db.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({
        where: { id },
        data: {
          customerId: input.customerId,
          projectId: input.projectId,
          date: parseDateOnly(input.date),
          paymentTermDays: input.paymentTermDays,
          dueDate: parseDateOnly(input.dueDate),
          depositPercent: input.depositPercent,
          depositAmount: calcDeposit(totals.grandTotal, input.depositPercent),
          ...totals,
          terms: input.terms,
          internalNotes: input.internalNotes,
          items: { create: rows },
        },
      });
      await refreshInvoice(tx, id);
    });
    const attachments = await storeAttachments(`invoices/${id}`, files);
    if (attachments.length) await db.invoiceAttachment.createMany({ data: attachments.map((a) => ({ ...a, invoiceId: id })) });

    revalidate(id, input.customerId);
  });
}

export async function deleteInvoiceAttachment(id: string, attachmentId: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const attachment = await db.invoiceAttachment.findFirst({ where: { id: attachmentId, invoiceId: id } });
    if (!attachment) throw new BusinessError("Attachment not found.");
    await db.invoiceAttachment.delete({ where: { id: attachmentId } });
    await deleteStoredFile(attachment.fileKey);
    revalidate(id);
  });
}

export async function recordInvoicePayment(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SALES", "edit");
    const data = parseInput(invoicePaymentSchema, input);
    const inv = await getInvoice(id);
    if (!inv) throw new BusinessError("Invoice not found.");
    if (inv.remaining <= 0) throw new BusinessError("This invoice is already fully paid.");
    if (data.amount > inv.remaining + 0.005) {
      throw new BusinessError("The payment is more than the remaining balance on this invoice.");
    }
    const account = await db.paymentAccount.findUnique({ where: { id: data.paymentAccountId }, select: { isActive: true } });
    if (!account?.isActive) throw new BusinessError("Choose an active payment account.");

    await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PAYMENT", parseDateOnly(data.date));
      await tx.invoicePayment.create({
        data: {
          number,
          invoiceId: id,
          amount: round2(data.amount),
          date: parseDateOnly(data.date),
          paymentAccountId: data.paymentAccountId,
          reference: data.reference,
          notes: data.notes,
          createdById: auth.user.id,
        },
      });
      await refreshInvoice(tx, id);
    });

    const f = await getFormatters();
    await notify({
      type: "CUSTOMER_PAYMENT_RECEIVED",
      title: `Payment received from ${inv.customer.name}`,
      message: `${f.money(data.amount)} recorded against ${inv.number}${data.reference ? ` (${data.reference})` : ""}.`,
      link: `/sales/invoices/${id}`,
    });
    revalidate(id, inv.customerId);
  });
}

export async function prepareInvoiceEmail(id: string): Promise<ActionResult<{ to: string; subject: string; body: string }>> {
  return runAction(async () => {
    await authorize("SALES", "view");
    const inv = await getInvoice(id);
    if (!inv) throw new BusinessError("Invoice not found.");
    const f = await getFormatters();
    const rendered = await renderEmailTemplate("INVOICE", {
      recipient_name: inv.customer.contactPerson ?? inv.customer.name,
      document_number: inv.number,
      document_date: f.date(inv.date),
      due_date: f.date(inv.dueDate),
      total: f.money(inv.grandTotal),
      remaining: f.money(inv.remaining),
    });
    return { to: inv.customer.email ?? "", subject: rendered.subject, body: rendered.text };
  });
}

export async function sendInvoice(id: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const message = parseInput(sendDocumentSchema, input);
    const inv = await getInvoice(id);
    if (!inv) throw new BusinessError("Invoice not found.");
    if (inv.items.length === 0) throw new BusinessError("Add at least one item before sending.");

    const pdf = await renderInvoicePdf(inv);
    await sendEmail({
      to: message.to,
      subject: message.subject,
      text: message.body,
      attachments: [{ filename: `${inv.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { sentAt: new Date(), status: inv.status === "DRAFT" ? "SENT" : inv.status } });
      await refreshInvoice(tx, id);
    });
    revalidate(id, inv.customerId);
  });
}

/** For customers without email: the invoice was printed/handed over, so it counts as issued. */
export async function markInvoiceSent(id: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SALES", "edit");
    const inv = await db.invoice.findUnique({ where: { id }, select: { status: true, customerId: true } });
    if (!inv) throw new BusinessError("Invoice not found.");
    if (inv.status !== "DRAFT") throw new BusinessError("Only draft invoices can be marked as sent.");
    await db.$transaction(async (tx) => {
      await tx.invoice.update({ where: { id }, data: { sentAt: new Date(), status: "SENT" } });
      await refreshInvoice(tx, id);
    });
    revalidate(id, inv.customerId);
  });
}
