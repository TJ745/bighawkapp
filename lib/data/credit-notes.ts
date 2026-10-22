import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { num } from "@/lib/decimal";
import { paginate, type ListParams } from "@/lib/list-params";

/** Reads for the credit note list, its detail page and the section on an invoice. */

const CREDIT_FILTERS: Record<string, Prisma.CreditNoteWhereInput> = {
  issued: { status: "ISSUED" },
  cancelled: { status: "CANCELLED" },
  refunded: { status: "ISSUED", refundedTotal: { gt: 0 } },
};

export async function listCreditNotes(params: ListParams) {
  const where: Prisma.CreditNoteWhereInput = {
    ...(CREDIT_FILTERS[params.filter] ?? {}),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: "insensitive" } },
            { reason: { contains: params.q, mode: "insensitive" } },
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
            { invoice: { number: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [rows, total, sum] = await Promise.all([
    db.creditNote.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      ...paginate(params),
      include: {
        customer: { select: { id: true, name: true } },
        invoice: { select: { id: true, number: true } },
        _count: { select: { items: true } },
      },
    }),
    db.creditNote.count({ where }),
    // Cancelled notes credit nothing, so the headline figures only count the ones that stand.
    db.creditNote.aggregate({ where: { ...where, status: "ISSUED" }, _sum: { grandTotal: true, refundedTotal: true } }),
  ]);

  return {
    notes: rows.map((row) => ({
      id: row.id,
      number: row.number,
      date: row.date,
      reason: row.reason,
      status: row.status,
      grandTotal: num(row.grandTotal),
      refundedTotal: num(row.refundedTotal),
      lineCount: row._count.items,
      customerId: row.customer.id,
      customerName: row.customer.name,
      invoiceId: row.invoice.id,
      invoiceNumber: row.invoice.number,
    })),
    total,
    credited: num(sum._sum.grandTotal),
    refunded: num(sum._sum.refundedTotal),
  };
}

export type CreditNoteRow = Awaited<ReturnType<typeof listCreditNotes>>["notes"][number];

export async function getCreditNote(id: string) {
  const note = await db.creditNote.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      customer: { select: { id: true, name: true, contactPerson: true, address: true, vatNumber: true, crNumber: true, phone: true, email: true } },
      invoice: { select: { id: true, number: true, date: true, grandTotal: true, paidTotal: true, creditedTotal: true, status: true } },
      payments: { include: { paymentAccount: { select: { name: true } } } },
    },
  });
  if (!note) return null;

  const { payments, ...rest } = note;
  return {
    ...rest,
    subtotal: num(note.subtotal),
    discountTotal: num(note.discountTotal),
    vatTotal: num(note.vatTotal),
    grandTotal: num(note.grandTotal),
    refundedTotal: num(note.refundedTotal),
    items: note.items.map((item) => ({
      ...item,
      quantity: num(item.quantity),
      unitPrice: num(item.unitPrice),
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
      lineSubtotal: num(item.lineSubtotal),
      lineDiscount: num(item.lineDiscount),
      lineVat: num(item.lineVat),
      lineTotal: num(item.lineTotal),
    })),
    invoice: {
      ...note.invoice,
      grandTotal: num(note.invoice.grandTotal),
      paidTotal: num(note.invoice.paidTotal),
      creditedTotal: num(note.invoice.creditedTotal),
    },
    /** The refund rows are negative; shown as positive money given back. */
    refunds: payments.map((payment) => ({
      id: payment.id,
      number: payment.number,
      date: payment.date,
      amount: Math.abs(num(payment.amount)),
      accountName: payment.paymentAccount.name,
      reference: payment.reference,
    })),
  };
}

export type CreditNoteDetail = NonNullable<Awaited<ReturnType<typeof getCreditNote>>>;

/** The credit notes on one invoice, for the section under it. */
export async function listCreditNotesForInvoice(invoiceId: string) {
  const rows = await db.creditNote.findMany({
    where: { invoiceId },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    select: { id: true, number: true, date: true, reason: true, status: true, grandTotal: true, refundedTotal: true },
  });
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    date: row.date,
    reason: row.reason,
    status: row.status,
    grandTotal: num(row.grandTotal),
    refundedTotal: num(row.refundedTotal),
  }));
}

export type InvoiceCreditNote = Awaited<ReturnType<typeof listCreditNotesForInvoice>>[number];
