"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import type { FinanceCategoryKind } from "@/lib/generated/prisma/enums";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { round2 } from "@/lib/business/totals";
import { getPurchase } from "@/lib/data/procurement";
import { getInvoice } from "@/lib/data/sales";
import { parseDateOnly } from "@/lib/dates";
import { renderEmailTemplate, sendEmail } from "@/lib/email/mailer";
import { renderPurchasePdf } from "@/lib/pdf/procurement";
import { renderInvoicePdf } from "@/lib/pdf/sales";
import { getFormatters } from "@/lib/settings/formatters";
import { deleteStoredFile, DOCUMENT_TYPES, fileFromFormData, MAX_DOCUMENT_BYTES, storeFile } from "@/lib/storage";
import { categoryNameSchema, financeEntrySchema } from "@/lib/validation/finance";
import { sendDocumentSchema } from "@/lib/validation/sales";

function revalidate() {
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/settings/accounts");
}

async function assertCategory(id: string, kind: FinanceCategoryKind) {
  const c = await db.financeCategory.findUnique({ where: { id }, select: { kind: true, isActive: true } });
  if (!c || c.kind !== kind || !c.isActive) throw new BusinessError("Choose a valid category.");
}

async function assertAccount(id: string) {
  const a = await db.paymentAccount.findUnique({ where: { id }, select: { isActive: true } });
  if (!a?.isActive) throw new BusinessError("Choose an active payment account.");
}

async function attachmentData(formData: FormData, folder: string) {
  const file = fileFromFormData(formData, "attachment");
  if (!file) return null;
  const saved = await storeFile(file, folder, { allowedTypes: DOCUMENT_TYPES, maxBytes: MAX_DOCUMENT_BYTES });
  return { attachmentName: saved.name, attachmentKey: saved.key, attachmentType: saved.mimeType, attachmentSize: saved.size };
}

// --- Other income -------------------------------------------------------------

export async function createOtherIncome(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("FINANCE", "create");
    const input = parseInput(financeEntrySchema, formDataToObject(formData));
    await assertCategory(input.categoryId, "INCOME");
    await assertAccount(input.paymentAccountId);
    const attachment = await attachmentData(formData, "income");

    const row = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "INCOME", parseDateOnly(input.date));
      return tx.otherIncome.create({
        data: {
          number,
          categoryId: input.categoryId,
          amount: round2(input.amount),
          date: parseDateOnly(input.date),
          paymentAccountId: input.paymentAccountId,
          description: input.description,
          ...attachment,
          createdById: auth.user.id,
        },
      });
    });
    revalidate();
    return { id: row.id };
  });
}

export async function updateOtherIncome(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("FINANCE", "edit");
    const existing = await db.otherIncome.findUnique({ where: { id } });
    if (!existing) throw new BusinessError("Income entry not found.");
    const raw = formDataToObject(formData);
    const input = parseInput(financeEntrySchema, raw);
    await assertCategory(input.categoryId, "INCOME");
    await assertAccount(input.paymentAccountId);
    const attachment = await attachmentData(formData, "income");
    const removeAttachment = raw.removeAttachment === "true";

    await db.otherIncome.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        amount: round2(input.amount),
        date: parseDateOnly(input.date),
        paymentAccountId: input.paymentAccountId,
        description: input.description,
        ...(attachment ?? (removeAttachment ? { attachmentName: null, attachmentKey: null, attachmentType: null, attachmentSize: null } : {})),
      },
    });
    if ((attachment || removeAttachment) && existing.attachmentKey) await deleteStoredFile(existing.attachmentKey);
    revalidate();
  });
}

// --- General expenses ----------------------------------------------------------

export async function createExpense(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("FINANCE", "create");
    const input = parseInput(financeEntrySchema, formDataToObject(formData));
    await assertCategory(input.categoryId, "EXPENSE");
    await assertAccount(input.paymentAccountId);
    const attachment = await attachmentData(formData, "expenses");

    const row = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "EXPENSE", parseDateOnly(input.date));
      return tx.expense.create({
        data: {
          number,
          categoryId: input.categoryId,
          amount: round2(input.amount),
          date: parseDateOnly(input.date),
          paymentAccountId: input.paymentAccountId,
          description: input.description,
          ...attachment,
          createdById: auth.user.id,
        },
      });
    });
    revalidate();
    return { id: row.id };
  });
}

export async function updateExpense(id: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("FINANCE", "edit");
    const existing = await db.expense.findUnique({ where: { id } });
    if (!existing) throw new BusinessError("Expense not found.");
    const raw = formDataToObject(formData);
    const input = parseInput(financeEntrySchema, raw);
    await assertCategory(input.categoryId, "EXPENSE");
    await assertAccount(input.paymentAccountId);
    const attachment = await attachmentData(formData, "expenses");
    const removeAttachment = raw.removeAttachment === "true";

    await db.expense.update({
      where: { id },
      data: {
        categoryId: input.categoryId,
        amount: round2(input.amount),
        date: parseDateOnly(input.date),
        paymentAccountId: input.paymentAccountId,
        description: input.description,
        ...(attachment ?? (removeAttachment ? { attachmentName: null, attachmentKey: null, attachmentType: null, attachmentSize: null } : {})),
      },
    });
    if ((attachment || removeAttachment) && existing.attachmentKey) await deleteStoredFile(existing.attachmentKey);
    revalidate();
  });
}

// --- Categories ---------------------------------------------------------------

export async function createFinanceCategory(kind: FinanceCategoryKind, nameInput: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    await authorize("FINANCE", "create");
    if (kind !== "INCOME" && kind !== "EXPENSE") throw new BusinessError("Invalid category kind.");
    const name = parseInput(categoryNameSchema, nameInput);
    const existing = await db.financeCategory.findUnique({ where: { kind_name: { kind, name } } });
    if (existing) {
      if (!existing.isActive) await db.financeCategory.update({ where: { id: existing.id }, data: { isActive: true } });
      return { id: existing.id, name: existing.name };
    }
    const row = await db.financeCategory.create({ data: { kind, name } });
    revalidate();
    return { id: row.id, name: row.name };
  });
}

// --- Reminders ---------------------------------------------------------------

export async function prepareInvoiceReminder(invoiceId: string): Promise<ActionResult<{ to: string; subject: string; body: string }>> {
  return runAction(async () => {
    await authorize("FINANCE", "view");
    const inv = await getInvoice(invoiceId);
    if (!inv) throw new BusinessError("Invoice not found.");
    const f = await getFormatters();
    const rendered = await renderEmailTemplate("PAYMENT_REMINDER", {
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

export async function sendInvoiceReminder(invoiceId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("FINANCE", "edit");
    const message = parseInput(sendDocumentSchema, input);
    const inv = await getInvoice(invoiceId);
    if (!inv) throw new BusinessError("Invoice not found.");
    if (inv.remaining <= 0) throw new BusinessError("This invoice is already paid.");
    const pdf = await renderInvoicePdf(inv);
    await sendEmail({
      to: message.to,
      subject: message.subject,
      text: message.body,
      attachments: [{ filename: `${inv.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  });
}

export async function preparePurchaseReminder(purchaseId: string): Promise<ActionResult<{ to: string; subject: string; body: string }>> {
  return runAction(async () => {
    await authorize("FINANCE", "view");
    const p = await getPurchase(purchaseId);
    if (!p) throw new BusinessError("Purchase not found.");
    const f = await getFormatters();
    const rendered = await renderEmailTemplate("SUPPLIER_PAYMENT_REMINDER", {
      recipient_name: p.supplier.contactPerson ?? p.supplier.name,
      document_number: p.number,
      document_date: f.date(p.date),
      due_date: f.date(p.dueDate),
      total: f.money(p.grandTotal),
      remaining: f.money(p.remaining),
    });
    return { to: p.supplier.email ?? "", subject: rendered.subject, body: rendered.text };
  });
}

export async function sendPurchaseReminder(purchaseId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("FINANCE", "edit");
    const message = parseInput(sendDocumentSchema, input);
    const p = await getPurchase(purchaseId);
    if (!p) throw new BusinessError("Purchase not found.");
    const pdf = await renderPurchasePdf(p);
    await sendEmail({
      to: message.to,
      subject: message.subject,
      text: message.body,
      attachments: [{ filename: `${p.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  });
}
