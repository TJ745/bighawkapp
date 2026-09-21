import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { num } from "@/lib/decimal";
import { parseDateOnly } from "@/lib/dates";
import type { DateRange } from "@/lib/validation/finance";
import { round2 } from "./totals";

/**
 * Single source of truth for money in / money out.
 * Income  = customer invoice payments + other income.
 * Expense = supplier purchase payments + general expenses.
 * Everything is cash-based on the payment/entry date, so Finance and the Dashboard agree.
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
  otherIncome: number;
  totalIncome: number;
  supplierPayments: number;
  generalExpenses: number;
  totalExpenses: number;
  profit: number;
};

export async function getFinanceTotals(range: DateRange): Promise<FinanceTotals> {
  const date = dateWhere(range);
  const [cp, oi, sp, ge] = await Promise.all([
    db.invoicePayment.aggregate({ where: { date }, _sum: { amount: true } }),
    db.otherIncome.aggregate({ where: { date }, _sum: { amount: true } }),
    db.purchasePayment.aggregate({ where: { date }, _sum: { amount: true } }),
    db.expense.aggregate({ where: { date }, _sum: { amount: true } }),
  ]);
  const customerPayments = num(cp._sum.amount);
  const otherIncome = num(oi._sum.amount);
  const supplierPayments = num(sp._sum.amount);
  const generalExpenses = num(ge._sum.amount);
  const totalIncome = round2(customerPayments + otherIncome);
  const totalExpenses = round2(supplierPayments + generalExpenses);
  return { customerPayments, otherIncome, totalIncome, supplierPayments, generalExpenses, totalExpenses, profit: round2(totalIncome - totalExpenses) };
}

export type IncomeEntry = {
  id: string;
  kind: "CUSTOMER_PAYMENT" | "OTHER_INCOME";
  number: string;
  date: Date;
  description: string;
  amount: number;
  accountId: string;
  accountName: string;
  category: string | null;
  // Where "View" goes: the invoice for payments, the entry itself for other income.
  invoiceId?: string;
  customerName?: string;
};

export type ExpenseEntry = {
  id: string;
  kind: "SUPPLIER_PAYMENT" | "GENERAL_EXPENSE";
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
};

export type IncomeFilters = { type?: "customer-payment" | "other-income"; accountId?: string };
export type ExpenseFilters = { type?: "supplier-payment" | "general-expense"; accountId?: string; categoryId?: string };

export async function listIncomeEntries(range: DateRange, filters: IncomeFilters): Promise<IncomeEntry[]> {
  const date = dateWhere(range);
  const account = filters.accountId ? { paymentAccountId: filters.accountId } : {};
  const [payments, incomes] = await Promise.all([
    filters.type === "other-income"
      ? []
      : db.invoicePayment.findMany({
          where: { date, ...account },
          include: { invoice: { select: { id: true, number: true, customer: { select: { name: true } } } }, paymentAccount: { select: { name: true } } },
        }),
    filters.type === "customer-payment"
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
  const [payments, expenses] = await Promise.all([
    filters.type === "general-expense" || filters.categoryId
      ? []
      : db.purchasePayment.findMany({
          where: { date, ...account },
          include: { purchase: { select: { id: true, number: true, supplier: { select: { name: true } } } }, paymentAccount: { select: { name: true } } },
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
  const [accounts, cp, oi, sp, ge] = await Promise.all([
    db.paymentAccount.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "asc" }] }),
    db.invoicePayment.groupBy({ by: ["paymentAccountId"], _sum: { amount: true } }),
    db.otherIncome.groupBy({ by: ["paymentAccountId"], _sum: { amount: true } }),
    db.purchasePayment.groupBy({ by: ["paymentAccountId"], _sum: { amount: true } }),
    db.expense.groupBy({ by: ["paymentAccountId"], _sum: { amount: true } }),
  ]);
  const sum = (rows: { paymentAccountId: string; _sum: { amount: unknown } }[], id: string) =>
    num((rows.find((r) => r.paymentAccountId === id)?._sum.amount ?? 0) as number);
  return accounts.map((a) => {
    const opening = num(a.openingBalance);
    const balance = round2(opening + sum(cp, a.id) + sum(oi, a.id) - sum(sp, a.id) - sum(ge, a.id));
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
      customer: { select: { id: true, name: true, email: true, contactPerson: true } },
    },
  });
  return rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal), paidTotal: num(r.paidTotal), remaining: round2(num(r.grandTotal) - num(r.paidTotal)) }));
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
      supplier: { select: { id: true, name: true, email: true, contactPerson: true } },
    },
  });
  return rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal), paidTotal: num(r.paidTotal), remaining: round2(num(r.grandTotal) - num(r.paidTotal)) }));
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
