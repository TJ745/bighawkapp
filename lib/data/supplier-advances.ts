import "server-only";
import { db } from "@/lib/db";
import { advanceBalance } from "@/lib/business/advance-balance";
import { num } from "@/lib/decimal";
import { round2 } from "@/lib/business/totals";

/** Reads for supplier prepayments. */

/**
 * Every prepayment made to a supplier, newest first, with what each is still holding and where it
 * went.
 *
 * The applications come back with the prepayment because "what happened to our deposit" is the
 * question this card exists to answer — a balance alone would send someone hunting through
 * purchases.
 */
export async function listSupplierAdvances(supplierId: string) {
  const rows = await db.supplierAdvance.findMany({
    where: { supplierId },
    orderBy: [{ date: "desc" }, { number: "desc" }],
    include: {
      paymentAccount: { select: { name: true } },
      payments: {
        orderBy: { date: "asc" },
        select: { id: true, amount: true, date: true, purchase: { select: { id: true, number: true } } },
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
      documentId: payment.purchase.id,
      documentNumber: payment.purchase.number,
    })),
    refunds: row.refunds.map((refund) => ({
      id: refund.id,
      amount: num(refund.amount),
      date: refund.date,
      accountName: refund.paymentAccount.name,
    })),
  }));
}

export type SupplierAdvanceRow = Awaited<ReturnType<typeof listSupplierAdvances>>[number];

/** What is sitting with a supplier, unspent: the sum of every open prepayment. */
export async function supplierAdvanceBalance(supplierId: string) {
  const rows = await db.supplierAdvance.findMany({
    where: { supplierId, status: { not: "CANCELLED" } },
    select: { amount: true, appliedTotal: true, refundedTotal: true },
  });
  return round2(rows.reduce((total, row) => total + advanceBalance(row).available, 0));
}

/**
 * Purchases this supplier is still owed money on, for choosing what a prepayment should settle.
 *
 * Only this supplier's own bills are offered: one supplier's deposit must never settle another's,
 * and the engine refuses it too.
 */
export async function listSettleablePurchases(supplierId: string) {
  const rows = await db.purchase.findMany({
    where: { supplierId, status: { notIn: ["DRAFT", "PAID"] } },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: { id: true, number: true, dueDate: true, grandTotal: true, paidTotal: true },
  });
  return rows
    .map((row) => ({
      id: row.id,
      number: row.number,
      dueDate: row.dueDate,
      owing: round2(num(row.grandTotal) - num(row.paidTotal)),
    }))
    .filter((row) => row.owing > 0);
}

export type SettleablePurchase = Awaited<ReturnType<typeof listSettleablePurchases>>[number];
