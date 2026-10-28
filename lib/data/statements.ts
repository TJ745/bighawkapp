import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { buildStatement, type Statement, type StatementMovement } from "@/lib/business/statement";
import { ageDocuments, type Aging } from "@/lib/business/aging";
import { round2 } from "@/lib/business/totals";
import type { DateRange } from "@/lib/validation/finance";

/** Everything that moved on one customer's account, and what is still owed. */
export type CustomerStatement = Statement & {
  customer: { id: string; name: string; contactPerson: string | null; address: string | null; vatNumber: string | null; crNumber: string | null; phone: string; email: string | null };
  range: DateRange;
  /** How old the closing balance is, by due date — the same buckets the receivables screen uses. */
  aging: Aging;
};

const DOCUMENTS = { status: { not: "DRAFT" } } as const;

export async function getCustomerStatement(customerId: string, range: DateRange, today: string): Promise<CustomerStatement | null> {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer) return null;

  const from = range.from ? new Date(`${range.from}T00:00:00.000Z`) : null;
  const to = range.to ? new Date(`${range.to}T00:00:00.000Z`) : null;
  const within = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  const period = from || to ? { date: within } : {};

  const [invoices, payments, credits, outstanding] = await Promise.all([
    db.invoice.findMany({ where: { customerId, ...DOCUMENTS, ...period }, select: { number: true, date: true, grandTotal: true } }),
    db.invoicePayment.findMany({
      where: { invoice: { customerId, ...DOCUMENTS }, ...period },
      select: { number: true, date: true, amount: true, invoice: { select: { number: true } } },
    }),
    db.creditNote.findMany({
      where: { customerId, status: "ISSUED", ...period },
      select: { number: true, date: true, grandTotal: true, invoice: { select: { number: true } } },
    }),
    // What is still owed, for the aging block. Not period-limited: a debt is as old as it is.
    db.invoice.findMany({
      where: { customerId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { dueDate: true, grandTotal: true, paidTotal: true, creditedTotal: true },
    }),
  ]);

  /**
   * What was owed before the period started.
   *
   * Counted the same way as the movements, over everything dated earlier, so the statement opens
   * where the last one closed instead of pretending the account began today.
   */
  const openingBalance = from ? await balanceBefore(customerId, from) : 0;

  const movements: StatementMovement[] = [
    ...invoices.map((row) => ({
      kind: "INVOICE" as const,
      date: row.date,
      number: row.number,
      description: `Invoice ${row.number}`,
      amount: num(row.grandTotal),
    })),
    ...payments.map((row) => ({
      kind: "PAYMENT" as const,
      date: row.date,
      number: row.number,
      // A negative amount is a refund, and the wording follows the figure rather than guessing.
      description: num(row.amount) < 0 ? `Refund against ${row.invoice.number}` : `Payment for ${row.invoice.number}`,
      amount: -num(row.amount),
    })),
    ...credits.map((row) => ({
      kind: "CREDIT_NOTE" as const,
      date: row.date,
      number: row.number,
      description: `Credit note against ${row.invoice.number}`,
      amount: -num(row.grandTotal),
    })),
  ];

  return {
    ...buildStatement(openingBalance, movements),
    customer,
    range,
    aging: ageDocuments(
      outstanding.map((row) => ({
        dueDate: row.dueDate.toISOString().slice(0, 10),
        remaining: round2(num(row.grandTotal) - num(row.paidTotal) - num(row.creditedTotal)),
      })),
      today,
    ),
  };
}

/** Everything owed from before a date, by the same arithmetic the statement itself uses. */
async function balanceBefore(customerId: string, from: Date) {
  const [invoices, payments, credits] = await Promise.all([
    db.invoice.aggregate({ where: { customerId, ...DOCUMENTS, date: { lt: from } }, _sum: { grandTotal: true } }),
    db.invoicePayment.aggregate({ where: { invoice: { customerId, ...DOCUMENTS }, date: { lt: from } }, _sum: { amount: true } }),
    db.creditNote.aggregate({ where: { customerId, status: "ISSUED", date: { lt: from } }, _sum: { grandTotal: true } }),
  ]);
  return round2(num(invoices._sum.grandTotal) - num(payments._sum.amount) - num(credits._sum.grandTotal));
}
