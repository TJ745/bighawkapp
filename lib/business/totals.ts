// Line-item and document totals. Pure and client-safe so the form preview and the
// server use exactly the same arithmetic. Server-side results are authoritative.

export type LineInput = {
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
};

export type LineTotals = { subtotal: number; discount: number; vat: number; total: number };

export type DocumentTotals = { subtotal: number; discountTotal: number; vatTotal: number; grandTotal: number };

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcLine(line: LineInput): LineTotals {
  const subtotal = round2(num(line.quantity) * num(line.unitPrice));
  const discount = round2((subtotal * clampPercent(line.discountPercent)) / 100);
  const taxable = round2(subtotal - discount);
  const vat = round2((taxable * clampPercent(line.vatRate)) / 100);
  return { subtotal, discount, vat, total: round2(taxable + vat) };
}

export function calcTotals(lines: LineInput[]): DocumentTotals {
  let subtotal = 0;
  let discountTotal = 0;
  let vatTotal = 0;
  for (const line of lines) {
    const t = calcLine(line);
    subtotal += t.subtotal;
    discountTotal += t.discount;
    vatTotal += t.vat;
  }
  subtotal = round2(subtotal);
  discountTotal = round2(discountTotal);
  vatTotal = round2(vatTotal);
  return { subtotal, discountTotal, vatTotal, grandTotal: round2(subtotal - discountTotal + vatTotal) };
}

/**
 * Splits a **VAT-inclusive** amount into what it was worth and the VAT inside it.
 *
 * Every other amount in this app is typed net with VAT added on top, because that is how an
 * invoice is written. An expense is the other way round: somebody is holding a receipt for what
 * they actually paid, and the VAT is already in that figure. Asking them to do the division is
 * asking them to get it wrong.
 *
 * The net is derived and the VAT is the remainder, never the other way about, so
 * `net + vat === total` **exactly** — the figure that left the bank is the one that stays whole,
 * and no rounding tail can appear between the two halves.
 */
export function vatFromGross(total: number, vatRate: number): { net: number; vat: number } {
  const gross = round2(num(total));
  const rate = clampPercent(vatRate);
  if (rate <= 0) return { net: gross, vat: 0 };
  const net = round2((gross * 100) / (100 + rate));
  return { net, vat: round2(gross - net) };
}

/** Deposit amount for a document total (0 when no deposit). */
export function calcDeposit(grandTotal: number, depositPercent: number) {
  return round2((num(grandTotal) * clampPercent(depositPercent)) / 100);
}

function num(v: number) {
  return Number.isFinite(v) ? v : 0;
}

function clampPercent(v: number) {
  return Math.min(100, Math.max(0, num(v)));
}
