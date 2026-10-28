import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { num } from "@/lib/decimal";
import { parseDateOnly } from "@/lib/dates";
import type { DateRange } from "@/lib/validation/finance";
import { round2 } from "./totals";

/**
 * Single source of truth for money in / money out.
 * Income  = customer invoice payments + POS takings + other income.
 * Expense = supplier purchase payments + general expenses.
 * Everything is cash-based on the payment/entry date, so Finance and the Dashboard agree.
 *
 * POS sales are paid on the spot, so their payments are income exactly like an invoice payment:
 * one more source here rather than a parallel set of figures.
 */

export function dateWhere(range: DateRange): Prisma.DateTimeFilter | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: parseDateOnly(range.from) } : {}),
    ...(range.to ? { lte: parseDateOnly(range.to) } : {}),
  };
}

export type FinanceTotals = {
  customerPayments: number;
  posSales: number;
  otherIncome: number;
  totalIncome: number;
  supplierPayments: number;
  generalExpenses: number;
  totalExpenses: number;
  profit: number;
};

/**
 * Payment rows that represent cash actually arriving.
 *
 * A payment funded by a customer advance is **not** one: that money came in when the advance was
 * taken and is counted there. Including it here would show the same riyal as income twice and
 * overstate every bank balance by the value of every deposit ever taken — so this filter belongs
 * on every read of `invoicePayment` that means "money in".
 */
const CASH_PAYMENTS = { customerAdvanceId: null } as const;

/**
 * The same rule read backwards, for money going out.
 *
 * A purchase payment funded by a supplier prepayment is **not** cash leaving: it left when the
 * prepayment was made and is counted there. Without this filter the same riyal is an expense
 * twice and every bank balance is understated by the value of every deposit ever paid.
 */
const CASH_SUPPLIER_PAYMENTS = { supplierAdvanceId: null } as const;

/** Advances that still stand. A cancelled one was keyed in error and never counted. */
const LIVE_ADVANCES = { status: { not: "CANCELLED" } } as const;

export async function getFinanceTotals(range: DateRange): Promise<FinanceTotals> {
  const date = dateWhere(range);
  const [cp, adv, advRefunds, pos, oi, sp, prepaid, prepaidBack, ge] = await Promise.all([
    db.invoicePayment.aggregate({ where: { date, ...CASH_PAYMENTS }, _sum: { amount: true } }),
    db.customerAdvance.aggregate({ where: { date, ...LIVE_ADVANCES }, _sum: { amount: true } }),
    db.customerAdvanceRefund.aggregate({ where: { date, advance: LIVE_ADVANCES }, _sum: { amount: true } }),
    db.posPayment.aggregate({ where: { date, sale: { status: { not: "VOIDED" } } }, _sum: { amount: true } }),
    db.otherIncome.aggregate({ where: { date }, _sum: { amount: true } }),
    db.purchasePayment.aggregate({ where: { date, ...CASH_SUPPLIER_PAYMENTS }, _sum: { amount: true } }),
    db.supplierAdvance.aggregate({ where: { date, ...LIVE_ADVANCES }, _sum: { amount: true } }),
    db.supplierAdvanceRefund.aggregate({ where: { date, advance: LIVE_ADVANCES }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { date }, _sum: { amount: true } }),
  ]);
  /**
   * Advances taken, less any unused money handed back in this same period. Both are customer money
   * arriving and leaving, so they belong with customer payments rather than in a column of their own.
   */
  const customerPayments = round2(num(cp._sum.amount) + num(adv._sum.amount) - num(advRefunds._sum.amount));
  const posSales = num(pos._sum.amount);
  const otherIncome = num(oi._sum.amount);
  /**
   * Prepayments made, less any unused money the supplier sent back in this same period. Both are
   * money going to and coming from suppliers, so they belong with supplier payments rather than
   * in a column of their own — exactly as advances sit with customer payments above.
   */
  const supplierPayments = round2(num(sp._sum.amount) + num(prepaid._sum.amount) - num(prepaidBack._sum.amount));
  const generalExpenses = num(ge._sum.amount);
  const totalIncome = round2(customerPayments + posSales + otherIncome);
  const totalExpenses = round2(supplierPayments + generalExpenses);
  return { customerPayments, posSales, otherIncome, totalIncome, supplierPayments, generalExpenses, totalExpenses, profit: round2(totalIncome - totalExpenses) };
}

export type IncomeEntry = {
  id: string;
  kind: "CUSTOMER_PAYMENT" | "CUSTOMER_ADVANCE" | "ADVANCE_REFUND" | "POS_SALE" | "OTHER_INCOME";
  number: string;
  date: Date;
  description: string;
  amount: number;
  accountId: string;
  accountName: string;
  category: string | null;
  // Where "View" goes: the invoice for payments, the sale for POS takings, the entry itself for
  // other income.
  invoiceId?: string;
  posSaleId?: string;
  advanceId?: string;
  customerId?: string;
  customerName?: string | null;
};

export type ExpenseEntry = {
  id: string;
  kind: "SUPPLIER_PAYMENT" | "SUPPLIER_ADVANCE" | "ADVANCE_RETURNED" | "GENERAL_EXPENSE";
  number: string;
  date: Date;
  description: string;
  amount: number;
  accountId: string;
  accountName: string;
  category: string | null;
  categoryId?: string;
  purchaseId?: string;
  supplierName?: string;
  supplierId?: string;
  advanceId?: string;
};

export type IncomeFilters = { type?: "customer-payment" | "pos-sale" | "other-income"; accountId?: string };
export type ExpenseFilters = { type?: "supplier-payment" | "general-expense"; accountId?: string; categoryId?: string };

export async function listIncomeEntries(range: DateRange, filters: IncomeFilters): Promise<IncomeEntry[]> {
  const date = dateWhere(range);
  const account = filters.accountId ? { paymentAccountId: filters.accountId } : {};
  const [payments, advances, advanceRefunds, posPayments, incomes] = await Promise.all([
    filters.type && filters.type !== "customer-payment"
      ? []
      : db.invoicePayment.findMany({
          where: { date, ...account, ...CASH_PAYMENTS },
          include: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } }, paymentAccount: { select: { name: true } } },
        }),
    /** An advance is customer money arriving, so it sits under the same filter as a payment. */
    filters.type && filters.type !== "customer-payment"
      ? []
      : db.customerAdvance.findMany({
          where: { date, ...account, ...LIVE_ADVANCES },
          include: { customer: { select: { id: true, name: true } }, paymentAccount: { select: { name: true } } },
        }),
    filters.type && filters.type !== "customer-payment"
      ? []
      : db.customerAdvanceRefund.findMany({
          where: { date, ...account, advance: LIVE_ADVANCES },
          include: { advance: { select: { number: true, customer: { select: { id: true, name: true } } } }, paymentAccount: { select: { name: true } } },
        }),
    filters.type && filters.type !== "pos-sale"
      ? []
      : db.posPayment.findMany({
          where: { date, ...account, sale: { status: { not: "VOIDED" } } },
          include: {
            sale: { select: { id: true, number: true, customer: { select: { name: true } }, branch: { select: { name: true } } } },
            paymentAccount: { select: { name: true } },
          },
        }),
    filters.type && filters.type !== "other-income"
      ? []
      : db.otherIncome.findMany({ where: { date, ...account }, include: { category: { select: { name: true } }, paymentAccount: { select: { name: true } } } }),
  ]);
  const entries: IncomeEntry[] = [
    ...payments.map((p) => ({
      id: p.id,
      kind: "CUSTOMER_PAYMENT" as const,
      number: p.number,
      date: p.date,
      description: `Payment for ${p.invoice.number} — ${p.invoice.customer.name}${p.reference ? ` (${p.reference})` : ""}`,
      amount: num(p.amount),
      accountId: p.paymentAccountId,
      accountName: p.paymentAccount.name,
      category: null,
      invoiceId: p.invoice.id,
      customerName: p.invoice.customer.name,
    })),
    ...advances.map((a) => ({
      id: a.id,
      kind: "CUSTOMER_ADVANCE" as const,
      number: a.number,
      date: a.date,
      description: `Advance from ${a.customer.name}${a.reference ? ` (${a.reference})` : ""}`,
      amount: num(a.amount),
      accountId: a.paymentAccountId,
      accountName: a.paymentAccount.name,
      category: null,
      customerName: a.customer.name,
      customerId: a.customer.id,
      advanceId: a.id,
    })),
    /** Shown as a negative, because that is what it did to the month's income. */
    ...advanceRefunds.map((r) => ({
      id: r.id,
      kind: "ADVANCE_REFUND" as const,
      number: r.advance.number,
      date: r.date,
      description: `Advance returned to ${r.advance.customer.name}${r.reference ? ` (${r.reference})` : ""}`,
      amount: -num(r.amount),
      accountId: r.paymentAccountId,
      accountName: r.paymentAccount.name,
      category: null,
      customerName: r.advance.customer.name,
      customerId: r.advance.customer.id,
      advanceId: r.advanceId,
    })),
    ...posPayments.map((p) => ({
      id: p.id,
      kind: "POS_SALE" as const,
      number: p.sale.number,
      date: p.date,
      description: `POS sale ${p.sale.number} — ${p.sale.customer?.name ?? "Walk-in"} (${p.sale.branch.name})`,
      amount: num(p.amount),
      accountId: p.paymentAccountId,
      accountName: p.paymentAccount.name,
      category: null,
      posSaleId: p.sale.id,
      customerName: p.sale.customer?.name ?? null,
    })),
    ...incomes.map((i) => ({
      id: i.id,
      kind: "OTHER_INCOME" as const,
      number: i.number,
      date: i.date,
      description: i.description ?? i.category.name,
      amount: num(i.amount),
      accountId: i.paymentAccountId,
      accountName: i.paymentAccount.name,
      category: i.category.name,
    })),
  ];
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime() || b.number.localeCompare(a.number));
}

export async function listExpenseEntries(range: DateRange, filters: ExpenseFilters): Promise<ExpenseEntry[]> {
  const date = dateWhere(range);
  const account = filters.accountId ? { paymentAccountId: filters.accountId } : {};
  const [payments, prepayments, prepaymentsBack, expenses] = await Promise.all([
    filters.type === "general-expense" || filters.categoryId
      ? []
      : db.purchasePayment.findMany({
          where: { date, ...account, ...CASH_SUPPLIER_PAYMENTS },
          include: { purchase: { select: { id: true, number: true, supplier: { select: { name: true } } } }, paymentAccount: { select: { name: true } } },
        }),
    /** A prepayment is supplier money leaving, so it sits under the same filter as a payment. */
    filters.type === "general-expense" || filters.categoryId
      ? []
      : db.supplierAdvance.findMany({
          where: { date, ...account, ...LIVE_ADVANCES },
          include: { supplier: { select: { id: true, name: true } }, paymentAccount: { select: { name: true } } },
        }),
    filters.type === "general-expense" || filters.categoryId
      ? []
      : db.supplierAdvanceRefund.findMany({
          where: { date, ...account, advance: LIVE_ADVANCES },
          include: { advance: { select: { number: true, supplier: { select: { id: true, name: true } } } }, paymentAccount: { select: { name: true } } },
        }),
    filters.type === "supplier-payment"
      ? []
      : db.expense.findMany({
          where: { date, ...account, ...(filters.categoryId ? { categoryId: filters.categoryId } : {}) },
          include: { category: { select: { name: true } }, paymentAccount: { select: { name: true } } },
        }),
  ]);
  const entries: ExpenseEntry[] = [
    ...payments.map((p) => ({
      id: p.id,
      kind: "SUPPLIER_PAYMENT" as const,
      number: p.number,
      date: p.date,
      description: `Payment for ${p.purchase.number} — ${p.purchase.supplier.name}${p.reference ? ` (${p.reference})` : ""}`,
      amount: num(p.amount),
      accountId: p.paymentAccountId,
      accountName: p.paymentAccount.name,
      category: "Supplier Payment",
      purchaseId: p.purchase.id,
      supplierName: p.purchase.supplier.name,
    })),
    ...prepayments.map((a) => ({
      id: a.id,
      kind: "SUPPLIER_ADVANCE" as const,
      number: a.number,
      date: a.date,
      description: `Prepayment to ${a.supplier.name}${a.reference ? ` (${a.reference})` : ""}`,
      amount: num(a.amount),
      accountId: a.paymentAccountId,
      accountName: a.paymentAccount.name,
      category: "Supplier Payment",
      supplierName: a.supplier.name,
      supplierId: a.supplier.id,
      advanceId: a.id,
    })),
    /**
     * Money coming back is shown here as a negative rather than as income: it reverses an
     * expense already recorded, and listing it under money-in would make both columns bigger
     * than the business actually traded.
     */
    ...prepaymentsBack.map((r) => ({
      id: r.id,
      kind: "ADVANCE_RETURNED" as const,
      number: r.advance.number,
      date: r.date,
      description: `Unused prepayment returned by ${r.advance.supplier.name}${r.reference ? ` (${r.reference})` : ""}`,
      amount: -num(r.amount),
      accountId: r.paymentAccountId,
      accountName: r.paymentAccount.name,
      category: "Supplier Payment",
      supplierName: r.advance.supplier.name,
      supplierId: r.advance.supplier.id,
    })),
    ...expenses.map((e) => ({
      id: e.id,
      kind: "GENERAL_EXPENSE" as const,
      number: e.number,
      date: e.date,
      description: e.description ?? e.category.name,
      amount: num(e.amount),
      accountId: e.paymentAccountId,
      accountName: e.paymentAccount.name,
      category: e.category.name,
      categoryId: e.categoryId,
    })),
  ];
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime() || b.number.localeCompare(a.number));
}

export type AccountBalance = { id: string; name: string; type: string; isActive: boolean; openingBalance: number; balance: number };

/** Current balance per payment account: opening + money in − money out. */
export async function getAccountBalances(): Promise<AccountBalance[]> {
  const [accounts, cp, adv, advRefunds, pos, oi, sp, prepaid, prepaidBack, ge] = await Promise.all([
    db.paymentAccount.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    // Advance-funded payments are left out for the same reason as in the totals: that cash is
    // already in the account, counted on the advance.
    db.invoicePayment.groupBy({ by: ["paymentAccountId"], where: CASH_PAYMENTS, _sum: { amount: true } }),
    db.customerAdvance.groupBy({ by: ["paymentAccountId"], where: LIVE_ADVANCES, _sum: { amount: true } }),
    db.customerAdvanceRefund.groupBy({ by: ["paymentAccountId"], where: { advance: LIVE_ADVANCES }, _sum: { amount: true } }),
    db.posPayment.groupBy({ by: ["paymentAccountId"], where: { sale: { status: { not: "VOIDED" } } }, _sum: { amount: true } }),
    db.otherIncome.groupBy({ by: ["paymentAccountId"], _sum: { amount: true } }),
    db.purchasePayment.groupBy({ by: ["paymentAccountId"], where: CASH_SUPPLIER_PAYMENTS, _sum: { amount: true } }),
    db.supplierAdvance.groupBy({ by: ["paymentAccountId"], where: LIVE_ADVANCES, _sum: { amount: true } }),
    db.supplierAdvanceRefund.groupBy({ by: ["paymentAccountId"], where: { advance: LIVE_ADVANCES }, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["paymentAccountId"], _sum: { amount: true } }),
  ]);
  const sum = (rows: { paymentAccountId: string; _sum: { amount: unknown } }[], id: string) =>
    num((rows.find((r) => r.paymentAccountId === id)?._sum.amount ?? 0) as number);
  return accounts.map((a) => {
    const opening = num(a.openingBalance);
    const balance = round2(
      opening +
        sum(cp, a.id) +
        sum(adv, a.id) -
        sum(advRefunds, a.id) +
        sum(pos, a.id) +
        sum(oi, a.id) -
        sum(sp, a.id) -
        sum(prepaid, a.id) +
        sum(prepaidBack, a.id) -
        sum(ge, a.id),
    );
    return { id: a.id, name: a.name, type: a.type, isActive: a.isActive, openingBalance: opening, balance };
  });
}

// ---------------------------------------------------------------------------
// Receivables (who owes us) and payables (who we owe)
// ---------------------------------------------------------------------------

export type OutstandingFilters = { partyId?: string; status?: "unpaid" | "partially-paid" | "overdue" | "paid"; overdueOnly?: boolean };

const RECEIVABLE_STATUS = { unpaid: "SENT", "partially-paid": "PARTIALLY_PAID", overdue: "OVERDUE", paid: "PAID" } as const;

export async function listReceivables(range: DateRange, filters: OutstandingFilters) {
  const rows = await db.invoice.findMany({
    where: {
      status: filters.overdueOnly ? "OVERDUE" : filters.status ? RECEIVABLE_STATUS[filters.status] : { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
      ...(filters.partyId ? { customerId: filters.partyId } : {}),
      dueDate: dateWhere(range),
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      dueDate: true,
      status: true,
      grandTotal: true,
      paidTotal: true,
      creditedTotal: true,
      customer: { select: { id: true, name: true, email: true, contactPerson: true } },
    },
  });
  // What is owed is the total less what was paid and less what was credited away.
  return rows.map((r) => ({
    ...r,
    grandTotal: num(r.grandTotal),
    paidTotal: num(r.paidTotal),
    creditedTotal: num(r.creditedTotal),
    remaining: round2(num(r.grandTotal) - num(r.paidTotal) - num(r.creditedTotal)),
  }));
}

export type ReceivableRow = Awaited<ReturnType<typeof listReceivables>>[number];

const PAYABLE_STATUS = { unpaid: ["RECEIVED", "UNPAID"], "partially-paid": ["PARTIALLY_PAID"], overdue: ["OVERDUE"], paid: ["PAID"] } as const;

export async function listPayables(range: DateRange, filters: OutstandingFilters) {
  const rows = await db.purchase.findMany({
    where: {
      status: {
        in: filters.overdueOnly ? ["OVERDUE"] : filters.status ? [...PAYABLE_STATUS[filters.status]] : ["RECEIVED", "UNPAID", "PARTIALLY_PAID", "OVERDUE"],
      },
      ...(filters.partyId ? { supplierId: filters.partyId } : {}),
      dueDate: dateWhere(range),
    },
    orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    select: {
      id: true,
      number: true,
      dueDate: true,
      status: true,
      grandTotal: true,
      paidTotal: true,
      creditedTotal: true,
      supplier: { select: { id: true, name: true, email: true, contactPerson: true } },
    },
  });
  // Goods that went back reduce what is owed exactly as a payment does, so payables has to
  // subtract them too — otherwise a bill settled by a return keeps showing as money owed.
  return rows.map((r) => ({
    ...r,
    grandTotal: num(r.grandTotal),
    paidTotal: num(r.paidTotal),
    remaining: round2(num(r.grandTotal) - num(r.paidTotal) - num(r.creditedTotal)),
  }));
}

export type PayableRow = Awaited<ReturnType<typeof listPayables>>[number];

export type PartyOutstanding = { id: string; name: string; email: string | null; outstanding: number; overdue: number; count: number };

/** Groups document-level rows into per-party totals (only rows with a balance). */
export function groupOutstanding(rows: { party: { id: string; name: string; email: string | null }; remaining: number; status: string }[]): PartyOutstanding[] {
  const map = new Map<string, PartyOutstanding>();
  for (const r of rows) {
    if (r.remaining <= 0) continue;
    const entry = map.get(r.party.id) ?? { id: r.party.id, name: r.party.name, email: r.party.email, outstanding: 0, overdue: 0, count: 0 };
    entry.outstanding = round2(entry.outstanding + r.remaining);
    if (r.status === "OVERDUE") entry.overdue = round2(entry.overdue + r.remaining);
    entry.count += 1;
    map.set(r.party.id, entry);
  }
  return [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
}
