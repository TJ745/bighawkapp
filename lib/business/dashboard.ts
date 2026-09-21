import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { parseDateOnly, toDateOnly } from "@/lib/dates";
import type { DateRange } from "@/lib/validation/finance";
import { dateWhere, getFinanceTotals, type FinanceTotals } from "./finance";
import { round2 } from "./totals";

/**
 * Dashboard figures. Money numbers come from the same cash-based calculations as Finance
 * (lib/business/finance.ts); "Sales" is what was invoiced in the period (drafts excluded).
 */

export type MoneyOverview = {
  sales: number;
  received: number;
  expenses: number;
  profit: number;
  /** Percentage change against the previous period of the same length (null when there is nothing to compare). */
  trend: {
    sales: number | null;
    received: number | null;
    expenses: number | null;
    profit: number | null;
  };
  comparisonLabel: string | null;
};

/** The period of the same length immediately before this one, for the "vs." comparison. */
function previousRange(range: DateRange): DateRange | null {
  if (!range.from || !range.to) return null;
  const from = parseDateOnly(range.from);
  const to = parseDateOnly(range.to);
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
  const prevTo = new Date(from);
  prevTo.setUTCDate(prevTo.getUTCDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setUTCDate(prevFrom.getUTCDate() - (days - 1));
  return { from: toDateOnly(prevFrom), to: toDateOnly(prevTo) };
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

async function invoicedTotal(range: DateRange) {
  const row = await db.invoice.aggregate({
    where: { status: { not: "DRAFT" }, date: dateWhere(range) },
    _sum: { grandTotal: true },
  });
  return num(row._sum.grandTotal);
}

export async function getMoneyOverview(range: DateRange, comparisonLabel = "vs. previous period"): Promise<{ overview: MoneyOverview; totals: FinanceTotals }> {
  const previous = previousRange(range);
  const [invoiced, totals, prevInvoiced, prevTotals] = await Promise.all([
    invoicedTotal(range),
    getFinanceTotals(range),
    previous ? invoicedTotal(previous) : Promise.resolve(null),
    previous ? getFinanceTotals(previous) : Promise.resolve(null),
  ]);
  return {
    overview: {
      sales: invoiced,
      received: totals.totalIncome,
      expenses: totals.totalExpenses,
      profit: totals.profit,
      trend: {
        sales: prevInvoiced === null ? null : percentChange(invoiced, prevInvoiced),
        received: prevTotals === null ? null : percentChange(totals.totalIncome, prevTotals.totalIncome),
        expenses: prevTotals === null ? null : percentChange(totals.totalExpenses, prevTotals.totalExpenses),
        profit: prevTotals === null ? null : percentChange(totals.profit, prevTotals.profit),
      },
      comparisonLabel: previous ? comparisonLabel : null,
    },
    totals,
  };
}

export type ProfitPoint = {
  period: string;
  label: string;
  income: number;
  expenses: number;
  profit: number;
};

/** Profit series for the chart: one point per day or per month within the range. */
export async function getProfitSeries(range: DateRange, granularity: "daily" | "monthly", today: string): Promise<ProfitPoint[]> {
  const from = range.from ?? (await earliestActivityDate()) ?? today;
  const to = range.to ?? today;
  const buckets = buildBuckets(from, to, granularity);
  if (buckets.length === 0) return [];

  const where = { date: { gte: parseDateOnly(from), lte: parseDateOnly(to) } };
  const [payments, incomes, supplierPayments, expenses] = await Promise.all([
    db.invoicePayment.findMany({ where, select: { date: true, amount: true } }),
    db.otherIncome.findMany({ where, select: { date: true, amount: true } }),
    db.purchasePayment.findMany({
      where,
      select: { date: true, amount: true },
    }),
    db.expense.findMany({ where, select: { date: true, amount: true } }),
  ]);

  const index = new Map(buckets.map((b, i) => [b.period, i]));
  const key = (d: Date) => (granularity === "daily" ? toDateOnly(d) : toDateOnly(d).slice(0, 7));
  const add = (rows: { date: Date; amount: unknown }[], field: "income" | "expenses") => {
    for (const row of rows) {
      const i = index.get(key(row.date));
      if (i === undefined) continue;
      buckets[i][field] = round2(buckets[i][field] + num(row.amount as number));
    }
  };
  add(payments, "income");
  add(incomes, "income");
  add(supplierPayments, "expenses");
  add(expenses, "expenses");

  return buckets.map((b) => ({ ...b, profit: round2(b.income - b.expenses) }));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MAX_BUCKETS = 400;

function buildBuckets(from: string, to: string, granularity: "daily" | "monthly"): ProfitPoint[] {
  const points: ProfitPoint[] = [];
  if (from > to) return points;
  if (granularity === "daily") {
    const cursor = parseDateOnly(from);
    const end = parseDateOnly(to);
    while (cursor <= end && points.length < MAX_BUCKETS) {
      const period = toDateOnly(cursor);
      points.push({
        period,
        label: `${period.slice(8)} ${MONTHS[Number(period.slice(5, 7)) - 1]}`,
        income: 0,
        expenses: 0,
        profit: 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return points;
  }
  let [y, m] = [Number(from.slice(0, 4)), Number(from.slice(5, 7))];
  const [ey, em] = [Number(to.slice(0, 4)), Number(to.slice(5, 7))];
  while ((y < ey || (y === ey && m <= em)) && points.length < MAX_BUCKETS) {
    const period = `${y}-${String(m).padStart(2, "0")}`;
    points.push({
      period,
      label: `${MONTHS[m - 1]} ${y}`,
      income: 0,
      expenses: 0,
      profit: 0,
    });
    m = m === 12 ? ((y += 1), 1) : m + 1;
  }
  return points;
}

async function earliestActivityDate(): Promise<string | null> {
  const [payment, expense] = await Promise.all([
    db.invoicePayment.findFirst({
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    db.expense.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
  ]);
  const dates = [payment?.date, expense?.date]
    .filter((d): d is Date => Boolean(d))
    .map(toDateOnly)
    .sort();
  return dates[0] ?? null;
}

// ---------------------------------------------------------------------------
// Needs attention & recent activity
// ---------------------------------------------------------------------------

export type ModuleScope = { sales: boolean; procurement: boolean };

export async function getNeedsAttention(scope: ModuleScope, limit = 5) {
  const [unpaidInvoices, supplierDue, recentPayments] = await Promise.all([
    !scope.sales
      ? []
      : db.invoice.findMany({
          where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
          orderBy: [{ dueDate: "asc" }],
          take: limit,
          select: {
            id: true,
            number: true,
            dueDate: true,
            status: true,
            grandTotal: true,
            paidTotal: true,
            customer: { select: { name: true } },
          },
        }),
    !scope.procurement
      ? []
      : db.purchase.findMany({
          where: {
            status: { in: ["RECEIVED", "UNPAID", "PARTIALLY_PAID", "OVERDUE"] },
          },
          orderBy: [{ dueDate: "asc" }],
          take: limit,
          select: {
            id: true,
            number: true,
            dueDate: true,
            status: true,
            grandTotal: true,
            paidTotal: true,
            supplier: { select: { name: true } },
          },
        }),
    !scope.sales
      ? []
      : db.invoicePayment.findMany({
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: limit,
          select: {
            id: true,
            number: true,
            date: true,
            amount: true,
            invoice: {
              select: {
                id: true,
                number: true,
                customer: { select: { name: true } },
              },
            },
          },
        }),
  ]);

  return {
    unpaidInvoices: unpaidInvoices.map((i) => ({
      id: i.id,
      number: i.number,
      dueDate: i.dueDate,
      status: i.status,
      name: i.customer.name,
      remaining: round2(num(i.grandTotal) - num(i.paidTotal)),
    })),
    supplierDue: supplierDue.map((p) => ({
      id: p.id,
      number: p.number,
      dueDate: p.dueDate,
      status: p.status,
      name: p.supplier.name,
      remaining: round2(num(p.grandTotal) - num(p.paidTotal)),
    })),
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      number: p.number,
      date: p.date,
      amount: num(p.amount),
      invoiceId: p.invoice.id,
      invoiceNumber: p.invoice.number,
      name: p.invoice.customer.name,
    })),
  };
}

export type NeedsAttention = Awaited<ReturnType<typeof getNeedsAttention>>;

export async function getRecentActivity(scope: ModuleScope, limit = 5) {
  const [invoices, purchases, payments] = await Promise.all([
    !scope.sales
      ? []
      : db.invoice.findMany({
          orderBy: [{ createdAt: "desc" }],
          take: limit,
          select: {
            id: true,
            number: true,
            date: true,
            status: true,
            grandTotal: true,
            customer: { select: { name: true } },
          },
        }),
    !scope.procurement
      ? []
      : db.purchase.findMany({
          orderBy: [{ createdAt: "desc" }],
          take: limit,
          select: {
            id: true,
            number: true,
            date: true,
            status: true,
            grandTotal: true,
            supplier: { select: { name: true } },
          },
        }),
    !scope.procurement
      ? []
      : db.purchasePayment.findMany({
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          take: limit,
          select: {
            id: true,
            number: true,
            date: true,
            amount: true,
            purchase: {
              select: {
                id: true,
                number: true,
                supplier: { select: { name: true } },
              },
            },
          },
        }),
  ]);
  return {
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      date: i.date,
      status: i.status,
      name: i.customer.name,
      total: num(i.grandTotal),
    })),
    purchases: purchases.map((p) => ({
      id: p.id,
      number: p.number,
      date: p.date,
      status: p.status,
      name: p.supplier.name,
      total: num(p.grandTotal),
    })),
    supplierPayments: payments.map((p) => ({
      id: p.id,
      number: p.number,
      date: p.date,
      amount: num(p.amount),
      purchaseId: p.purchase.id,
      purchaseNumber: p.purchase.number,
      name: p.purchase.supplier.name,
    })),
  };
}

export type RecentActivity = Awaited<ReturnType<typeof getRecentActivity>>;

/** Top customers by invoiced value in the period (drafts excluded). */
export async function getTopCustomers(range: DateRange, limit = 5) {
  const groups = await db.invoice.groupBy({
    by: ["customerId"],
    where: { status: { not: "DRAFT" }, date: dateWhere(range) },
    _sum: { grandTotal: true, paidTotal: true },
    orderBy: { _sum: { grandTotal: "desc" } },
    take: limit,
  });
  if (groups.length === 0) return [];
  const customers = await db.customer.findMany({
    where: { id: { in: groups.map((g) => g.customerId) } },
    select: { id: true, name: true },
  });
  return groups.map((g) => ({
    id: g.customerId,
    name: customers.find((c) => c.id === g.customerId)?.name ?? "Unknown",
    total: num(g._sum.grandTotal),
    paid: num(g._sum.paidTotal),
  }));
}

export type TopCustomer = Awaited<ReturnType<typeof getTopCustomers>>[number];

/** Project counts for the dashboard summary tiles. */
export async function getProjectSummary() {
  const [total, inProgress, completed, onHold] = await Promise.all([
    db.project.count(),
    db.project.count({ where: { status: "IN_PROGRESS" } }),
    db.project.count({ where: { status: "COMPLETED" } }),
    db.project.count({ where: { status: "ON_HOLD" } }),
  ]);
  return { total, inProgress, completed, onHold };
}

export type ProjectSummary = Awaited<ReturnType<typeof getProjectSummary>>;
