/**
 * Scale-printed labels.
 *
 * A shop scale weighs loose goods and prints a barcode that carries the item's PLU and either the
 * weight or the money amount. Layouts vary by scale, so the branch configures the prefix, how many
 * digits identify the item, and which of the two the trailing digits are:
 *
 *   2 | 01234 | 01250 | 7
 *   ^   ^       ^       ^ check digit
 *   |   |       +- 5 digits: 1.250 kg (WEIGHT) or 12.50 (PRICE)
 *   |   +--------- the item's PLU
 *   +------------- prefix that marks the label as coming from a scale
 *
 * Pure and client-safe: the till parses a scan to show the line immediately, and the server parses
 * the same string again when the sale is recorded. Neither trusts the other.
 */

export type ScaleBarcodeMode = "WEIGHT" | "PRICE";

export type ScaleBarcodeConfig = {
  enabled: boolean;
  /** Leading digits that mark a scale label, e.g. "2" or "21". */
  prefix: string;
  /** How many digits after the prefix identify the item. */
  codeDigits: number;
  mode: ScaleBarcodeMode;
};

export type ScaleBarcodeParts = {
  /** The item's PLU, as printed (leading zeros kept). */
  plu: string;
  /** PLU without leading zeros, for matching codes entered by hand. */
  pluTrimmed: string;
  mode: ScaleBarcodeMode;
  /** Weight in the item's unit, when the label carries a weight. */
  weight: number | null;
  /** Money amount, when the label carries a price. */
  amount: number | null;
};

/** The digits a scale label carries after the item code: 5, as 3 dp of weight or 2 dp of money. */
const VALUE_DIGITS = 5;

const DIGITS_ONLY = /^\d+$/;

/**
 * Reads a scanned code as a scale label, or returns null when it is an ordinary barcode.
 * Returning null is the normal case — the caller falls back to a plain barcode lookup.
 */
export function parseScaleBarcode(code: string, config: ScaleBarcodeConfig): ScaleBarcodeParts | null {
  if (!config.enabled) return null;
  const scanned = code.trim();
  const prefix = config.prefix.trim();
  if (!prefix || !DIGITS_ONLY.test(prefix)) return null;
  if (!DIGITS_ONLY.test(scanned)) return null;
  if (!scanned.startsWith(prefix)) return null;

  const codeDigits = Math.max(1, Math.min(8, Math.trunc(config.codeDigits)));
  // Prefix + item code + value, plus the check digit most scales append.
  const withoutCheck = prefix.length + codeDigits + VALUE_DIGITS;
  if (scanned.length !== withoutCheck && scanned.length !== withoutCheck + 1) return null;

  const plu = scanned.slice(prefix.length, prefix.length + codeDigits);
  const rawValue = scanned.slice(prefix.length + codeDigits, prefix.length + codeDigits + VALUE_DIGITS);
  const value = Number(rawValue);
  if (!Number.isFinite(value)) return null;

  return {
    plu,
    pluTrimmed: plu.replace(/^0+(?=\d)/, ""),
    mode: config.mode,
    weight: config.mode === "WEIGHT" ? Math.round(value) / 1000 : null,
    amount: config.mode === "PRICE" ? Math.round(value) / 100 : null,
  };
}

/**
 * The quantity a scale label means for an item at a given unit price.
 *
 * A weight label states the quantity outright. A price label states what the customer pays, so the
 * quantity is the amount divided by the unit price — which is why a price label is unusable on an
 * item with no price.
 */
export function scaleQuantity(parts: ScaleBarcodeParts, unitPrice: number): number | null {
  if (parts.mode === "WEIGHT") {
    return parts.weight !== null && parts.weight > 0 ? parts.weight : null;
  }
  if (parts.amount === null || parts.amount <= 0 || unitPrice <= 0) return null;
  return Math.round((parts.amount / unitPrice) * 1000) / 1000;
}

/** Units that are measured rather than counted, so a till should accept decimals for them. */
const MEASURED_UNITS = new Set(["kg", "g", "l", "ml", "m", "hour"]);

export function isMeasuredUnit(unit: string) {
  return MEASURED_UNITS.has(unit.trim().toLowerCase());
}

/**
 * A readable example of the configured layout, for the settings screen — including the total
 * length, because a layout that does not match the shop's scale simply never matches a scan.
 */
export function describeScaleLayout(config: ScaleBarcodeConfig) {
  const prefix = config.prefix.trim() || "2";
  const digits = Math.max(1, Math.min(8, config.codeDigits));
  const plu = "123456780".slice(0, digits);
  const value = "01250";
  const meaning = config.mode === "WEIGHT" ? "1.250 of the item's unit" : "12.50 to pay";
  const withoutCheck = prefix.length + digits + VALUE_DIGITS;
  return { example: `${prefix}${plu}${value}7`, plu, meaning, withoutCheck, expectedLength: withoutCheck + 1 };
}
