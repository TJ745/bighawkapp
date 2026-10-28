import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calcDeposit, calcLine, calcTotals, round2, vatFromGross } from "./totals";

/**
 * The money core.
 *
 * Every figure a customer sees comes through here — invoice lines, POS receipts, credit notes,
 * returns, commission, margin. One wrong rounding step is wrong on every document at once and shows
 * up as a one-halala argument with a customer, so the arithmetic is pinned down rather than trusted.
 */

describe("round2", () => {
  it("keeps two places", () => {
    assert.equal(round2(12.345), 12.35);
    assert.equal(round2(12.344), 12.34);
    assert.equal(round2(100), 100);
  });

  it("rounds a half up rather than down", () => {
    // `Math.round(1.005 * 100) / 100` gives 1 — because 1.005 is really 1.00499…, so the naive
    // version loses a halala. The epsilon in round2 is what fixes it, and this is the proof.
    assert.equal(round2(1.005), 1.01);
    assert.equal(round2(0.005), 0.01);
    assert.equal(round2(2.675), 2.68);
  });

  it("clears the usual floating-point dust", () => {
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(0.07 * 3), 0.21);
  });
});

describe("calcLine", () => {
  it("charges VAT on the price", () => {
    assert.deepEqual(calcLine({ quantity: 1, unitPrice: 100, discountPercent: 0, vatRate: 15 }), {
      subtotal: 100,
      discount: 0,
      vat: 15,
      total: 115,
    });
  });

  it("charges VAT on what is left after the discount, not on the gross", () => {
    // The whole point: 15% of 90, not 15% of 100. Taxing the undiscounted figure would overcharge
    // the customer and overstate what is owed to the tax authority.
    assert.deepEqual(calcLine({ quantity: 1, unitPrice: 100, discountPercent: 10, vatRate: 15 }), {
      subtotal: 100,
      discount: 10,
      vat: 13.5,
      total: 103.5,
    });
  });

  it("multiplies by quantity before anything else", () => {
    assert.deepEqual(calcLine({ quantity: 3, unitPrice: 20, discountPercent: 0, vatRate: 15 }), {
      subtotal: 60,
      discount: 0,
      vat: 9,
      total: 69,
    });
  });

  it("handles a weighed quantity to three places", () => {
    // 1.234 kg at 10.50 is 12.957, which is money, so it lands on 12.96.
    assert.deepEqual(calcLine({ quantity: 1.234, unitPrice: 10.5, discountPercent: 0, vatRate: 15 }), {
      subtotal: 12.96,
      discount: 0,
      vat: 1.94,
      total: 14.9,
    });
  });

  it("gives away the line at a 100% discount, VAT included", () => {
    assert.deepEqual(calcLine({ quantity: 2, unitPrice: 50, discountPercent: 100, vatRate: 15 }), {
      subtotal: 100,
      discount: 100,
      vat: 0,
      total: 0,
    });
  });

  it("works with VAT switched off", () => {
    assert.deepEqual(calcLine({ quantity: 1, unitPrice: 100, discountPercent: 10, vatRate: 0 }), {
      subtotal: 100,
      discount: 10,
      vat: 0,
      total: 90,
    });
  });

  describe("refuses to produce nonsense from nonsense", () => {
    it("clamps a discount above 100% instead of paying the customer", () => {
      const line = calcLine({ quantity: 1, unitPrice: 100, discountPercent: 150, vatRate: 15 });
      assert.equal(line.discount, 100);
      assert.equal(line.total, 0);
    });

    it("clamps a negative discount to nothing instead of adding to the price", () => {
      const line = calcLine({ quantity: 1, unitPrice: 100, discountPercent: -10, vatRate: 15 });
      assert.equal(line.discount, 0);
      assert.equal(line.total, 115);
    });

    it("clamps a VAT rate above 100%", () => {
      assert.equal(calcLine({ quantity: 1, unitPrice: 100, discountPercent: 0, vatRate: 500 }).vat, 100);
    });

    it("treats NaN and Infinity as zero rather than spreading them", () => {
      // A single NaN reaching a stored total would poison every report that sums it.
      for (const bad of [NaN, Infinity, -Infinity]) {
        assert.deepEqual(calcLine({ quantity: bad, unitPrice: 100, discountPercent: 0, vatRate: 15 }), {
          subtotal: 0,
          discount: 0,
          vat: 0,
          total: 0,
        });
      }
    });
  });
});

describe("calcTotals", () => {
  const lines = [
    { quantity: 2, unitPrice: 50, discountPercent: 10, vatRate: 15 },
    { quantity: 1, unitPrice: 30, discountPercent: 0, vatRate: 15 },
  ];

  it("adds the lines up", () => {
    assert.deepEqual(calcTotals(lines), { subtotal: 130, discountTotal: 10, vatTotal: 18, grandTotal: 138 });
  });

  it("returns zeroes for a document with no lines", () => {
    assert.deepEqual(calcTotals([]), { subtotal: 0, discountTotal: 0, vatTotal: 0, grandTotal: 0 });
  });

  it("keeps the grand total equal to the sum of its lines", () => {
    /**
     * This is the invariant that lets a POS receipt and an invoice for the same lines agree, and it
     * is not free: the totals are summed from *already rounded* lines rather than recomputed from a
     * raw sum. Awkward sets — thirds, one-halala items, long lists — are where that would show.
     */
    const sets: (typeof lines)[] = [
      lines,
      [
        { quantity: 3, unitPrice: 33.33, discountPercent: 7, vatRate: 15 },
        { quantity: 1, unitPrice: 0.01, discountPercent: 0, vatRate: 15 },
      ],
      [
        { quantity: 1.234, unitPrice: 10.5, discountPercent: 3.5, vatRate: 15 },
        { quantity: 7, unitPrice: 1.11, discountPercent: 33.33, vatRate: 15 },
      ],
      Array.from({ length: 40 }, () => ({ quantity: 1, unitPrice: 0.07, discountPercent: 1, vatRate: 15 })),
      Array.from({ length: 13 }, (_, i) => ({ quantity: i + 1, unitPrice: 19.99, discountPercent: i, vatRate: 15 })),
    ];

    for (const set of sets) {
      const totals = calcTotals(set);
      const sumOfLines = round2(set.reduce((sum, line) => sum + calcLine(line).total, 0));
      assert.equal(totals.grandTotal, sumOfLines, `grand total disagrees with its lines for ${JSON.stringify(set)}`);
    }
  });

  it("keeps grandTotal = subtotal − discount + VAT", () => {
    for (const set of [lines, [{ quantity: 9, unitPrice: 7.77, discountPercent: 12.5, vatRate: 15 }]]) {
      const t = calcTotals(set);
      assert.equal(t.grandTotal, round2(t.subtotal - t.discountTotal + t.vatTotal));
    }
  });
});

describe("calcDeposit", () => {
  it("takes a percentage of the grand total", () => {
    assert.equal(calcDeposit(1000, 25), 250);
    assert.equal(calcDeposit(115, 50), 57.5);
  });

  it("is nothing when no deposit is asked for", () => {
    assert.equal(calcDeposit(1000, 0), 0);
  });

  it("never exceeds the total or goes negative", () => {
    assert.equal(calcDeposit(1000, 150), 1000);
    assert.equal(calcDeposit(1000, -10), 0);
  });

  it("rounds to the halala", () => {
    assert.equal(calcDeposit(99.99, 33.33), 33.33);
  });
});

describe("VAT inside an amount already paid", () => {
  it("splits a receipt into what it was worth and the VAT on it", () => {
    // 115 paid at 15% is 100 of goods and 15 of tax.
    assert.deepEqual(vatFromGross(115, 15), { net: 100, vat: 15 });
  });

  it("leaves an amount alone when no VAT was charged", () => {
    assert.deepEqual(vatFromGross(250, 0), { net: 250, vat: 0 });
  });

  it("always adds back to exactly what was paid", () => {
    /**
     * The invariant that matters: the figure that left the bank must stay whole. Deriving both
     * halves independently would leave a halala between them on amounts that do not divide, and
     * money out would stop matching the bank.
     */
    for (const total of [0.01, 1, 7.77, 33.33, 99.99, 100, 1234.56, 9999.95]) {
      const { net, vat } = vatFromGross(total, 15);
      assert.equal(round2(net + vat), round2(total), `${total} did not add back`);
    }
  });

  it("agrees with the way an invoice line is priced", () => {
    // The two directions must meet: a net of 100 at 15% invoices at 115, and 115 splits back to 100.
    const line = calcLine({ quantity: 1, unitPrice: 100, discountPercent: 0, vatRate: 15 });
    assert.deepEqual(vatFromGross(line.total, 15), { net: 100, vat: 15 });
  });

  it("treats nonsense as no VAT rather than throwing inside a form", () => {
    assert.deepEqual(vatFromGross(100, Number.NaN), { net: 100, vat: 0 });
    assert.deepEqual(vatFromGross(Number.NaN, 15), { net: 0, vat: 0 });
  });
});
