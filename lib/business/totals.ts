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
