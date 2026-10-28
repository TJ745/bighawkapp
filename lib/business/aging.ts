import { round2 } from "./totals";

/**
 * How old the money is.
 *
 * "Someone owes 40,000" and "someone has owed 40,000 since June" are different conversations, and
 * only one of them gets anybody paid. Receivables and payables both knew the total and whether it
 * was late; neither knew *how* late.
 *
 * Pure and client-safe: the buckets are shown on screen and summed into a header, and there must
 * be one definition of them.
 */

/** The buckets, in the order a person reads them. */
export const AGING_BUCKETS = ["current", "d1_30", "d31_60", "d61_90", "d90_plus"] as const;
export type AgingBucket = (typeof AGING_BUCKETS)[number];

export const AGING_LABELS: Record<AgingBucket, string> = {
  current: "Not yet due",
  d1_30: "1–30 days",
  d31_60: "31–60 days",
  d61_90: "61–90 days",
  d90_plus: "Over 90 days",
};

export type Aging = Record<AgingBucket, number> & { total: number };

export function emptyAging(): Aging {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, total: 0 };
}

/**
 * Whole days between two `YYYY-MM-DD` dates.
 *
 * Compared as dates, not as timestamps: a document due today is not one day late at 23:59, and a
 * business that chases on that basis annoys its customers.
 */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000);
}

/**
 * Which bucket a document falls in.
 *
 * **The due date itself is not late** — the same rule the overdue status uses, and the reason
 * this is one function rather than a comparison written out twice.
 */
export function bucketFor(dueDate: string, today: string): AgingBucket {
  const overdueBy = daysBetween(dueDate, today);
  if (overdueBy <= 0) return "current";
  if (overdueBy <= 30) return "d1_30";
  if (overdueBy <= 60) return "d31_60";
  if (overdueBy <= 90) return "d61_90";
  return "d90_plus";
}

/** Totals a set of outstanding documents into buckets. */
export function ageDocuments(documents: { dueDate: string; remaining: number }[], today: string): Aging {
  const aging = emptyAging();
  for (const document of documents) {
    if (document.remaining <= 0) continue;
    const bucket = bucketFor(document.dueDate, today);
    aging[bucket] = round2(aging[bucket] + document.remaining);
    aging.total = round2(aging.total + document.remaining);
  }
  return aging;
}
