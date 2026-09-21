import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { InvoiceStatus, QuotationStatus } from "@/lib/generated/prisma/enums";
import { num } from "@/lib/decimal";
import { parseDateOnly, todayInTimeZone } from "@/lib/dates";
import { paginate, type ListParams } from "@/lib/list-params";
import { fileUrl } from "@/lib/storage";
import { getAppSettings, getRegionalSettings } from "./settings";

export async function today() {
  return todayInTimeZone((await getRegionalSettings()).timeZone);
}

/**
 * Persists time-based status changes (expired quotations, overdue invoices) so lists,
 * filters and reports stay correct without a background job. Cheap; run before reads.
 */
export async function refreshSalesStatuses() {
  const todayDate = parseDateOnly(await today());
  await db.quotation.updateMany({
    where: { status: { in: ["DRAFT", "SENT"] }, validUntil: { lt: todayDate } },
    data: { status: "EXPIRED" },
  });
  await db.invoice.updateMany({
    where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: todayDate } },
    data: { status: "OVERDUE" },
  });
  // Unpaid deposit after the invoice date (column-to-column comparison needs SQL).
  await db.$executeRaw`
    UPDATE "Invoice" SET "status" = 'OVERDUE'
    WHERE "status" IN ('SENT', 'PARTIALLY_PAID') AND "depositAmount" > 0
      AND "date" < ${todayDate}::date AND "paidTotal" < "depositAmount"`;
}

// ---------------------------------------------------------------------------
// Shared mappers
// ---------------------------------------------------------------------------

const itemSelect = {
  id: true,
  sortOrder: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountPercent: true,
  vatRate: true,
  lineSubtotal: true,
  lineDiscount: true,
  lineVat: true,
  lineTotal: true,
} as const;

const attachmentSelect = { id: true, name: true, fileKey: true, mimeType: true, size: true, createdAt: true } as const;

type ItemRow = Prisma.QuotationItemGetPayload<{ select: typeof itemSelect }>;
type AttachmentRow = Prisma.QuotationAttachmentGetPayload<{ select: typeof attachmentSelect }>;

export function mapItem(i: ItemRow) {
  return {
    id: i.id,
    sortOrder: i.sortOrder,
    description: i.description,
    quantity: num(i.quantity),
    unitPrice: num(i.unitPrice),
    discountPercent: num(i.discountPercent),
    vatRate: num(i.vatRate),
    lineSubtotal: num(i.lineSubtotal),
    lineDiscount: num(i.lineDiscount),
    lineVat: num(i.lineVat),
    lineTotal: num(i.lineTotal),
  };
}

export function mapAttachment(a: AttachmentRow) {
  return { ...a, url: fileUrl(a.fileKey) };
}

export type DocumentItem = ReturnType<typeof mapItem>;
export type DocumentAttachment = ReturnType<typeof mapAttachment>;

const customerSelect = {
  id: true,
  name: true,
  type: true,
  contactPerson: true,
  email: true,
  phone: true,
  address: true,
  vatNumber: true,
  crNumber: true,
  nationalAddress: true,
  isActive: true,
} as const;

export type DocumentCustomer = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;

// ---------------------------------------------------------------------------
// Quotations
// ---------------------------------------------------------------------------

const QUOTATION_FILTERS: Record<string, QuotationStatus> = {
  draft: "DRAFT",
  sent: "SENT",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  expired: "EXPIRED",
};

function quotationWhere(params: ListParams, customerId?: string, projectId?: string): Prisma.QuotationWhereInput {
  const status = QUOTATION_FILTERS[params.filter];
  return {
    ...(customerId ? { customerId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: "insensitive" } },
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listQuotations(params: ListParams, customerId?: string, projectId?: string) {
  await refreshSalesStatuses();
  const where = quotationWhere(params, customerId, projectId);
  const [rows, total] = await Promise.all([
    db.quotation.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      ...paginate(params.page),
      select: {
        id: true,
        number: true,
        date: true,
        validUntil: true,
        status: true,
        grandTotal: true,
        customer: { select: { id: true, name: true, email: true } },
        invoice: { select: { id: true, number: true } },
      },
    }),
    db.quotation.count({ where }),
  ]);
  return { items: rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })), total };
}

export type QuotationListItem = Awaited<ReturnType<typeof listQuotations>>["items"][number];

export async function getQuotation(id: string) {
  await refreshSalesStatuses();
  const row = await db.quotation.findUnique({
    where: { id },
    include: {
      customer: { select: customerSelect },
      items: { select: itemSelect, orderBy: { sortOrder: "asc" } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
      invoice: { select: { id: true, number: true } },
      project: { select: { id: true, code: true, name: true } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    subtotal: num(row.subtotal),
    discountTotal: num(row.discountTotal),
    vatTotal: num(row.vatTotal),
    grandTotal: num(row.grandTotal),
    items: row.items.map(mapItem),
    attachments: row.attachments.map(mapAttachment),
  };
}

export type QuotationDetail = NonNullable<Awaited<ReturnType<typeof getQuotation>>>;

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

const INVOICE_FILTERS: Record<string, InvoiceStatus> = {
  draft: "DRAFT",
  sent: "SENT",
  "partially-paid": "PARTIALLY_PAID",
  paid: "PAID",
  overdue: "OVERDUE",
};

function invoiceWhere(params: ListParams, customerId?: string, projectId?: string): Prisma.InvoiceWhereInput {
  const status = INVOICE_FILTERS[params.filter];
  return {
    ...(customerId ? { customerId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(status ? { status } : {}),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: "insensitive" } },
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listInvoices(params: ListParams, customerId?: string, projectId?: string) {
  await refreshSalesStatuses();
  const where = invoiceWhere(params, customerId, projectId);
  const [rows, total] = await Promise.all([
    db.invoice.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      ...paginate(params.page),
      select: {
        id: true,
        number: true,
        date: true,
        dueDate: true,
        status: true,
        grandTotal: true,
        paidTotal: true,
        customer: { select: { id: true, name: true, email: true } },
      },
    }),
    db.invoice.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      ...r,
      grandTotal: num(r.grandTotal),
      paidTotal: num(r.paidTotal),
      remaining: num(r.grandTotal) - num(r.paidTotal),
    })),
    total,
  };
}

export type InvoiceListItem = Awaited<ReturnType<typeof listInvoices>>["items"][number];

export async function getInvoice(id: string) {
  await refreshSalesStatuses();
  const row = await db.invoice.findUnique({
    where: { id },
    include: {
      customer: { select: customerSelect },
      quotation: { select: { id: true, number: true } },
      project: { select: { id: true, code: true, name: true } },
      items: { select: itemSelect, orderBy: { sortOrder: "asc" } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
      payments: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: { paymentAccount: { select: { id: true, name: true } } },
      },
    },
  });
  if (!row) return null;
  const grandTotal = num(row.grandTotal);
  const paidTotal = num(row.paidTotal);
  return {
    ...row,
    subtotal: num(row.subtotal),
    discountTotal: num(row.discountTotal),
    vatTotal: num(row.vatTotal),
    grandTotal,
    paidTotal,
    remaining: grandTotal - paidTotal,
    depositPercent: num(row.depositPercent),
    depositAmount: num(row.depositAmount),
    items: row.items.map(mapItem),
    attachments: row.attachments.map(mapAttachment),
    payments: row.payments.map((p) => ({ ...p, amount: num(p.amount) })),
  };
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;
export type InvoicePaymentRow = InvoiceDetail["payments"][number];

/** Payments received from one customer (Customer → Payments tab). */
export async function listCustomerPayments(customerId: string) {
  const rows = await db.invoicePayment.findMany({
    where: { invoice: { customerId } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { invoice: { select: { id: true, number: true } }, paymentAccount: { select: { name: true } } },
  });
  return rows.map((p) => ({ ...p, amount: num(p.amount) }));
}

export type CustomerPaymentRow = Awaited<ReturnType<typeof listCustomerPayments>>[number];

/** Settings the document forms need (VAT policy, default terms, default T&Cs). */
export async function getDocumentFormSettings() {
  const s = await getAppSettings();
  return {
    vatEnabled: s.vatEnabled,
    defaultVatRate: s.defaultVatRate,
    allowVatChange: s.allowVatChange,
    defaultPaymentTermDays: s.defaultPaymentTermDays,
    defaultDepositPercent: s.defaultDepositPercent,
    defaultRemainingDueDays: s.defaultRemainingDueDays,
    quotationTerms: s.quotationTerms,
    invoiceTerms: s.invoiceTerms,
  };
}
