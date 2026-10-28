import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSide } from "./vat-totals";

/**
 * How one side of the VAT return adds up.
 *
 * These figures go on a filing, so being out by a credit note is not a cosmetic bug. The split
 * between standard-rated and zero-rated and the subtraction of credits are both places where a
 * plausible change produces a number that still looks like money.
 */

describe("one side of the VAT return", () => {
  it("separates what carried VAT from what did not", () => {
    // Zero-rated and exempt sales still belong on the return; they just bring no VAT with them.
    const side = buildSide(
      [
        { net: 1000, vat: 150 },
        { net: 500, vat: 0 },
      ],
      [],
    );
    assert.equal(side.standardRatedNet, 1000);
    assert.equal(side.standardRatedVat, 150);
    assert.equal(side.zeroRatedNet, 500);
    assert.equal(side.net, 1500, "both belong in the total");
    assert.equal(side.vat, 150);
  });

  it("takes credits off rather than adding them on", () => {
    // The sign is the whole risk here: a credit note that *increased* the VAT owed would be paid.
    const side = buildSide([{ net: 1000, vat: 150 }], [{ net: 200, vat: 30 }]);
    assert.equal(side.adjustmentsNet, 200);
    assert.equal(side.adjustmentsVat, 30);
    assert.equal(side.net, 800);
    assert.equal(side.vat, 120);
  });

  it("can go negative, because a period can credit more than it charged", () => {
    // A quarter spent putting right the one before is unusual, not impossible.
    const side = buildSide([{ net: 100, vat: 15 }], [{ net: 400, vat: 60 }]);
    assert.equal(side.net, -300);
    assert.equal(side.vat, -45);
  });

  it("is zero when nothing happened, not undefined", () => {
    const side = buildSide([], []);
    assert.deepEqual(side, {
      standardRatedNet: 0,
      standardRatedVat: 0,
      zeroRatedNet: 0,
      adjustmentsNet: 0,
      adjustmentsVat: 0,
      net: 0,
      vat: 0,
    });
  });

  it("rounds to halalas as it accumulates, so the total matches the lines", () => {
    const side = buildSide(
      [
        { net: 33.33, vat: 5 },
        { net: 33.33, vat: 5 },
        { net: 33.34, vat: 5 },
      ],
      [],
    );
    assert.equal(side.net, 100);
    assert.equal(side.vat, 15);
  });
});
