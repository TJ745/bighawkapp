import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeScaleLayout, isMeasuredUnit, parseScaleBarcode, scaleQuantity, type ScaleBarcodeConfig } from "./scale-barcode";

/**
 * Scale-printed labels.
 *
 * A layout that does not match the shop's scale simply never matches a scan — the till stays silent
 * and nobody can tell why. That makes this worth testing: the failure mode is nothing happening,
 * not an error anyone would see.
 */

/** The EAN-13 layout from the docs: 1 prefix + 6 PLU + 5 value + check digit = 13. */
const ean13: ScaleBarcodeConfig = { enabled: true, prefix: "2", codeDigits: 6, mode: "WEIGHT" };

describe("reading a scale label", () => {
  it("splits an EAN-13 weight label into PLU and weight", () => {
    const parts = parseScaleBarcode("2012345012507", ean13);
    assert.deepEqual(parts, { plu: "012345", pluTrimmed: "12345", mode: "WEIGHT", weight: 1.25, amount: null });
  });

  it("accepts the same label without the check digit", () => {
    // Some scanners hand over 12 digits, some 13. Both are the same label.
    assert.equal(parseScaleBarcode("201234501250", ean13)?.weight, 1.25);
  });

  it("reads the value as money in PRICE mode", () => {
    const parts = parseScaleBarcode("2012345012507", { ...ean13, mode: "PRICE" });
    assert.equal(parts?.amount, 12.5);
    assert.equal(parts?.weight, null);
  });

  it("keeps the PLU's leading zeros and offers a trimmed one for keypads", () => {
    const parts = parseScaleBarcode("2000123012507", ean13);
    assert.equal(parts?.plu, "000123");
    assert.equal(parts?.pluTrimmed, "123");
  });

  it("does not trim a PLU away to nothing", () => {
    // "000000" must stay readable as an item code, not become "".
    assert.equal(parseScaleBarcode("2000000012507", ean13)?.pluTrimmed, "0");
  });

  it("reads a multi-digit prefix", () => {
    const parts = parseScaleBarcode("21012345012507", { ...ean13, prefix: "21" });
    assert.equal(parts?.plu, "012345");
    assert.equal(parts?.weight, 1.25);
  });

  it("ignores surrounding whitespace from a scanner", () => {
    assert.equal(parseScaleBarcode("  2012345012507\n", ean13)?.weight, 1.25);
  });
});

describe("what is not a scale label", () => {
  /** Returning null is the normal case: the caller falls back to an ordinary barcode lookup. */
  it("passes over an ordinary barcode", () => {
    assert.equal(parseScaleBarcode("5012345678900", ean13), null);
  });

  it("passes over anything with a letter in it", () => {
    assert.equal(parseScaleBarcode("2012345X12507", ean13), null);
  });

  it("passes over a code of the wrong length, even with the right prefix", () => {
    for (const code of ["20123450125", "20123450125078", "2", "2012345"]) {
      assert.equal(parseScaleBarcode(code, ean13), null, `${code} should not parse`);
    }
  });

  it("does nothing at all when the feature is switched off", () => {
    assert.equal(parseScaleBarcode("2012345012507", { ...ean13, enabled: false }), null);
  });

  it("refuses a prefix that was never configured, rather than matching everything", () => {
    for (const prefix of ["", "   ", "abc"]) {
      assert.equal(parseScaleBarcode("2012345012507", { ...ean13, prefix }), null, `prefix "${prefix}" should match nothing`);
    }
  });

  it("clamps an out-of-range digit count instead of reading past the end", () => {
    // codeDigits is clamped to 1–8, so these become 1 and 8 and the length check does the rest.
    assert.equal(parseScaleBarcode("2012345012507", { ...ean13, codeDigits: 0 }), null);
    assert.equal(parseScaleBarcode("2012345012507", { ...ean13, codeDigits: 99 }), null);
    // With the clamp at 1, a 1 + 1 + 5 + check = 8 digit code is what matches.
    assert.equal(parseScaleBarcode("29012507", { ...ean13, codeDigits: 0 })?.plu, "9");
  });
});

describe("turning a label into a quantity", () => {
  const weightParts = parseScaleBarcode("2012345012507", ean13)!;
  const priceParts = parseScaleBarcode("2012345012507", { ...ean13, mode: "PRICE" })!;

  it("takes a weight label at its word", () => {
    assert.equal(scaleQuantity(weightParts, 10), 1.25);
  });

  it("works a price label back to a quantity", () => {
    // 12.50 of something priced at 10.00 per unit is 1.25 units.
    assert.equal(scaleQuantity(priceParts, 10), 1.25);
  });

  it("rounds a worked-back quantity to three places", () => {
    // 12.50 ÷ 3.00 = 4.1666…, and a quantity is Decimal(14,3).
    assert.equal(scaleQuantity(priceParts, 3), 4.167);
  });

  it("refuses a price label on an item with no price", () => {
    // Dividing by nothing would be an infinite quantity, so the scan is rejected instead.
    assert.equal(scaleQuantity(priceParts, 0), null);
    assert.equal(scaleQuantity(priceParts, -5), null);
  });

  it("refuses a label that carries no value", () => {
    const zeroWeight = parseScaleBarcode("2012345000007", ean13)!;
    assert.equal(zeroWeight.weight, 0);
    assert.equal(scaleQuantity(zeroWeight, 10), null);
  });
});

describe("describing the layout for the settings screen", () => {
  it("states the length a scan must have", () => {
    // The docs' worked example: 1 + 6 + 5 = 12, or 13 with the check digit.
    const described = describeScaleLayout(ean13);
    assert.equal(described.withoutCheck, 12);
    assert.equal(described.expectedLength, 13);
  });

  it("gives an example that the parser itself accepts", () => {
    /**
     * The screen must not advertise a layout the parser would reject — that is precisely the
     * confusion this feature causes when it is wrong.
     */
    for (const config of [
      ean13,
      { ...ean13, prefix: "21" },
      { ...ean13, codeDigits: 4 },
      { ...ean13, codeDigits: 8 },
      { ...ean13, mode: "PRICE" as const },
    ]) {
      const { example } = describeScaleLayout(config);
      assert.equal(example.length, describeScaleLayout(config).expectedLength, `example length wrong for ${JSON.stringify(config)}`);
      assert.notEqual(parseScaleBarcode(example, config), null, `the screen's own example does not parse: ${example}`);
    }
  });

  it("falls back to a sensible prefix rather than showing a broken example", () => {
    assert.ok(describeScaleLayout({ ...ean13, prefix: "" }).example.startsWith("2"));
  });
});

describe("measured units", () => {
  it("knows the units that are weighed or measured", () => {
    for (const unit of ["kg", "g", "l", "ml", "m", "hour"]) assert.equal(isMeasuredUnit(unit), true, unit);
  });

  it("ignores case and padding, because units are typed by hand", () => {
    assert.equal(isMeasuredUnit(" KG "), true);
    assert.equal(isMeasuredUnit("Hour"), true);
  });

  it("treats counted things as counted", () => {
    for (const unit of ["piece", "box", "each", ""]) assert.equal(isMeasuredUnit(unit), false, unit);
  });
});
