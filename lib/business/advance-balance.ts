import { num } from "@/lib/decimal";
import { round2 } from "./totals";

/**
 * What a customer advance is still holding.
 *
 * Pure and client-safe, kept out of the engine for the usual reason: it is the number every refusal
 * is measured against ("only X is left") *and* the number shown on screen beside it, so there must
 * be one of it. Takes Prisma Decimals or plain numbers, because it is called from both sides.
 */
export type AdvanceBalance = {
  amount: number;
  appliedTotal: number;
  refundedTotal: number;
  /** What is still available to put against an invoice or hand back. */
  available: number;
};

export function advanceBalance(advance: { amount: unknown; appliedTotal: unknown; refundedTotal: unknown }): AdvanceBalance {
  const amount = num(advance.amount as number);
  const appliedTotal = num(advance.appliedTotal as number);
  const refundedTotal = num(advance.refundedTotal as number);
  // Never negative: a figure out of step would otherwise read as money that can be spent again.
  return { amount, appliedTotal, refundedTotal, available: Math.max(0, round2(amount - appliedTotal - refundedTotal)) };
}
