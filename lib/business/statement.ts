import { round2 } from "./totals";

/**
 * A customer statement: everything that moved on their account, with a running balance.
 *
 * The document a business sends when it wants paying. Receivables already said *how much* and
 * aging said *how old*; neither said **why**, and "you owe us 40,000" without the workings is
 * the email that starts an argument rather than ending one.
 *
 * Pure and client-safe: the figures appear on screen and in a PDF, and there must be one of them.
 */

export type StatementMovementKind = "INVOICE" | "PAYMENT" | "CREDIT_NOTE";

/** One thing that happened, before it is placed in order or given a balance. */
export type StatementMovement = {
  kind: StatementMovementKind;
  date: Date;
  number: string;
  description: string;
  /**
   * What it did to the balance: positive increases what is owed, negative reduces it.
   *
   * A payment's amount may itself be **negative** — that is how a refund is recorded, as a
   * negative payment row — and it then correctly increases the balance again. One sign rule,
   * applied once, rather than a special case per kind.
   */
  amount: number;
};

export type StatementRow = StatementMovement & {
  /** Owed after this movement, so a reader can follow the account down the page. */
  balance: number;
};

export type Statement = {
  openingBalance: number;
  rows: StatementRow[];
  /** What the movements in this period came to, split for the summary line. */
  charged: number;
  paid: number;
  credited: number;
  closingBalance: number;
};

/**
 * Puts the movements in order and runs the balance down them.
 *
 * Sorted by date, then by what the movement is: on a day when an invoice is raised and paid, the
 * invoice has to come first or the statement shows a credit balance that never existed. Within a
 * kind, by number, so two runs of the same statement read identically.
 */
export function buildStatement(openingBalance: number, movements: StatementMovement[]): Statement {
  const order: Record<StatementMovementKind, number> = { INVOICE: 0, CREDIT_NOTE: 1, PAYMENT: 2 };
  const sorted = [...movements].sort(
    (a, b) =>
      a.date.getTime() - b.date.getTime() || order[a.kind] - order[b.kind] || a.number.localeCompare(b.number),
  );

  let balance = round2(openingBalance);
  const rows: StatementRow[] = sorted.map((movement) => {
    balance = round2(balance + movement.amount);
    return { ...movement, balance };
  });

  const total = (kind: StatementMovementKind) =>
    round2(sorted.filter((m) => m.kind === kind).reduce((sum, m) => sum + m.amount, 0));

  return {
    openingBalance: round2(openingBalance),
    rows,
    charged: total("INVOICE"),
    // Shown as what the customer handed over, so the summary line reads the way a person says it.
    paid: round2(-total("PAYMENT")),
    credited: round2(-total("CREDIT_NOTE")),
    closingBalance: balance,
  };
}
