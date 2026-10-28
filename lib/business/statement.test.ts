import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStatement, type StatementMovement } from "./statement";

/**
 * A customer statement.
 *
 * This is the document that goes out to chase money, so a wrong balance is an argument with a
 * customer rather than a bug report. The order of same-day movements and the sign of a refund
 * are both places where the arithmetic stays plausible while being wrong.
 */

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const invoice = (date: string, number: string, amount: number): StatementMovement => ({
  kind: "INVOICE",
  date: day(date),
  number,
  description: `Invoice ${number}`,
  amount,
});
const payment = (date: string, number: string, amount: number): StatementMovement => ({
  kind: "PAYMENT",
  date: day(date),
  number,
  description: `Payment ${number}`,
  amount: -amount,
});
const credit = (date: string, number: string, amount: number): StatementMovement => ({
  kind: "CREDIT_NOTE",
  date: day(date),
  number,
  description: `Credit note ${number}`,
  amount: -amount,
});

describe("a customer statement", () => {
  it("runs the balance down the page", () => {
    const s = buildStatement(0, [invoice("2026-01-05", "INV-1", 1000), payment("2026-01-20", "PAY-1", 400)]);
    assert.deepEqual(
      s.rows.map((r) => [r.number, r.balance]),
      [
        ["INV-1", 1000],
        ["PAY-1", 600],
      ],
    );
    assert.equal(s.closingBalance, 600);
  });

  it("carries forward what was owed before the period", () => {
    // Without this the statement reads as though the account started today.
    const s = buildStatement(250, [invoice("2026-02-01", "INV-2", 100)]);
    assert.equal(s.openingBalance, 250);
    assert.equal(s.closingBalance, 350);
  });

  it("puts an invoice before a payment made the same day", () => {
    /**
     * Paid on the day it was raised is ordinary. Sorted the other way the statement shows a
     * credit balance the customer never had, and somebody queries it.
     */
    const s = buildStatement(0, [payment("2026-03-01", "PAY-9", 500), invoice("2026-03-01", "INV-9", 500)]);
    assert.deepEqual(
      s.rows.map((r) => [r.number, r.balance]),
      [
        ["INV-9", 500],
        ["PAY-9", 0],
      ],
    );
  });

  it("treats a refund as money going back, because that is what the negative row means", () => {
    // A credit-note refund is stored as a negative payment. It must raise the balance again.
    const refund: StatementMovement = {
      kind: "PAYMENT",
      date: day("2026-04-10"),
      number: "PAY-R",
      description: "Refund on credit note",
      amount: 115,
    };
    const s = buildStatement(0, [invoice("2026-04-01", "INV-3", 115), payment("2026-04-05", "PAY-3", 115), credit("2026-04-09", "CN-1", 115), refund]);
    // Charged 115, paid 115, credited 115, refunded 115 — the account is square.
    assert.equal(s.closingBalance, 0);
  });

  it("reports the period's totals the way a person says them", () => {
    const s = buildStatement(0, [invoice("2026-05-01", "INV-4", 1000), payment("2026-05-02", "PAY-4", 300), credit("2026-05-03", "CN-2", 200)]);
    assert.equal(s.charged, 1000);
    assert.equal(s.paid, 300, "paid is what the customer handed over, not a negative");
    assert.equal(s.credited, 200);
    assert.equal(s.closingBalance, 500);
  });

  it("agrees with its own arithmetic: opening plus movements is the closing balance", () => {
    const s = buildStatement(125.5, [invoice("2026-06-01", "INV-5", 333.33), payment("2026-06-02", "PAY-5", 99.99), credit("2026-06-03", "CN-3", 33.33)]);
    const expected = Math.round((s.openingBalance + s.charged - s.paid - s.credited) * 100) / 100;
    assert.equal(s.closingBalance, expected);
  });

  it("is an opening balance and nothing else when the period is quiet", () => {
    const s = buildStatement(400, []);
    assert.deepEqual(s.rows, []);
    assert.equal(s.closingBalance, 400);
  });
});
