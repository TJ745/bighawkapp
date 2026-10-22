import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { advanceBalance } from "./advance-balance";

/**
 * What an advance is still holding.
 *
 * Small, but it is the number every refusal in the engine is measured against — "only X is left" —
 * and the one shown to the person deciding what a deposit should settle. Getting it wrong would
 * either let a deposit be spent twice or strand money nobody can reach.
 */

describe("advanceBalance", () => {
  it("has the whole amount available before anything is done with it", () => {
    assert.deepEqual(advanceBalance({ amount: 1000, appliedTotal: 0, refundedTotal: 0 }), {
      amount: 1000,
      appliedTotal: 0,
      refundedTotal: 0,
      available: 1000,
    });
  });

  it("takes off what has settled invoices", () => {
    assert.equal(advanceBalance({ amount: 1000, appliedTotal: 400, refundedTotal: 0 }).available, 600);
  });

  it("takes off what has been given back as well", () => {
    // Both reduce what is left: one became a payment, the other left the business.
    assert.equal(advanceBalance({ amount: 1000, appliedTotal: 400, refundedTotal: 200 }).available, 400);
  });

  it("reaches exactly nothing when it is fully spent", () => {
    assert.equal(advanceBalance({ amount: 1000, appliedTotal: 600, refundedTotal: 400 }).available, 0);
  });

  it("reads a Prisma Decimal as readily as a number", () => {
    // The row comes back from Prisma as Decimal objects, not numbers.
    const decimal = (value: number) => ({ toNumber: () => value }) as unknown as number;
    assert.equal(advanceBalance({ amount: decimal(575.25), appliedTotal: decimal(75.25), refundedTotal: decimal(0) }).available, 500);
  });

  it("rounds to the halala rather than leaving a floating-point tail", () => {
    // 100 − 33.33 − 33.33 is 33.34 in money, not 33.340000000000003.
    assert.equal(advanceBalance({ amount: 100, appliedTotal: 33.33, refundedTotal: 33.33 }).available, 33.34);
  });

  it("treats a missing figure as nothing rather than NaN", () => {
    assert.equal(advanceBalance({ amount: 500, appliedTotal: null, refundedTotal: undefined }).available, 500);
  });

  it("never reports more available than was ever received", () => {
    /** A negative applied or refunded total would be a bug elsewhere; it must not inflate the balance. */
    const balance = advanceBalance({ amount: 100, appliedTotal: 150, refundedTotal: 0 });
    assert.ok(balance.available <= balance.amount);
  });
});
