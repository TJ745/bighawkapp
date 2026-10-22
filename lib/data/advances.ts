import "server-only";
import { db } from "@/lib/db";
import { advanceBalance } from "@/lib/business/advance-balance";
import { num } from "@/lib/decimal";
import { round2 } from "@/lib/business/totals";

/** Reads for customer advances. */

/**
 * Every advance a customer has, newest first, with what each is still holding and where it went.
 *
 * The applications come back with the advance because "what happened to my deposit" is the question
 * this card exists to answer — a balance alone would send someone hunting through invoices.
 */
export async function listCustomerAdvances(customerId: string) {
  const rows = await db.customerAdvance.findMany({
    where: { customerId },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    include: {
      paymentAccount: { select: { name: true } },
      payments: {
        orderBy: { date: "asc" },
        select: { id: true, amount: true, date: true, invoice: { select: { id: true, number: true } } },
      },
      refunds: { orderBy: { date: "asc" }, select: { id: true, amount: true, date: true, paymentAccount: { select: { name: true } } } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    date: row.date,
    status: row.status,
    accountName: row.paymentAccount.name,
    reference: row.reference,
    notes: row.notes,
    cancelReason: row.cancelReason,
    ...advanceBalance(row),
    applications: row.payments.map((payment) => ({
      paymentId: payment.id,
      amount: num(payment.amount),
      date: payment.date,
      invoiceId: payment.invoice.id,
      invoiceNumber: payment.invoice.number,
    })),
    refunds: row.refunds.map((refund) => ({
      id: refund.id,
      amount: num(refund.amount),
      date: refund.date,
      accountName: refund.paymentAccount.name,
    })),
  }));
}

export type CustomerAdvanceRow = Awaited<ReturnType<typeof listCustomerAdvances>>[number];

/** What a customer has available to settle bills with: the sum of every open advance. */
export async function customerAdvanceBalance(customerId: string) {
  const rows = await db.customerAdvance.findMany({
    where: { customerId, status: { not: "CANCELLED" } },
    select: { amount: true, appliedTotal: true, refundedTotal: true },
  });
  return round2(rows.reduce((total, row) => total + advanceBalance(row).available, 0));
}

/**
 * Advances with money left, for settling an invoice from.
 *
 * Only the invoice's own customer is asked about: one customer's deposit must never settle
 * another's bill, and the engine refuses it too.
 */
export async function listAvailableAdvances(customerId: string) {
  const rows = await db.customerAdvance.findMany({
    where: { customerId, status: "OPEN" },
    orderBy: [{ date: "asc" }, { number: "asc" }],
    select: { id: true, number: true, date: true, amount: true, appliedTotal: true, refundedTotal: true },
  });
  return rows
    .map((row) => ({ id: row.id, number: row.number, date: row.date, available: advanceBalance(row).available }))
    .filter((row) => row.available > 0);
}

export type AvailableAdvance = Awaited<ReturnType<typeof listAvailableAdvances>>[number];

/** Invoices this customer still owes money on, for choosing what an advance should settle. */
export async function listSettleableInvoices(customerId: string) {
  const rows = await db.invoice.findMany({
    where: { customerId, status: { notIn: ["DRAFT", "PAID", "CREDITED"] } },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: { id: true, number: true, dueDate: true, grandTotal: true, paidTotal: true, creditedTotal: true },
  });
  return rows
    .map((row) => ({
      id: row.id,
      number: row.number,
      dueDate: row.dueDate,
      owing: round2(num(row.grandTotal) - num(row.paidTotal) - num(row.creditedTotal)),
    }))
    .filter((row) => row.owing > 0);
}

export type SettleableInvoice = Awaited<ReturnType<typeof listSettleableInvoices>>[number];
