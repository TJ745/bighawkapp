import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import type { DateRange } from "@/lib/validation/finance";
import { dateWhere } from "./finance";
import { round2 } from "./totals";
import { buildSide, type VatSide } from "./vat-totals";

export { buildSide, type VatDocument, type VatSide } from "./vat-totals";

/**
 * The VAT return.
 *
 * What was charged to customers, what was paid to suppliers, and the difference — the figures a
 * Saudi registrant files with ZATCA. Everything needed was already being recorded; nothing added
 * it up.
 *
 * **This is the one report in the app that is not cash-based.** Money in, money out, profit and
 * the account balances all follow payment dates, because that is what a small business feels. VAT
 * does not work that way: the tax point is the **document's own date**, so an invoice issued in
 * March belongs to March's return whether or not anybody has paid it. Reading these figures as if
 * they were the Finance screens would understate a quarter by every unpaid invoice in it, so the
 * screen says which basis it is on rather than leaving it to be assumed.
 *
 * Deliberately **not** called a filing. It totals what the business recorded; what ZATCA expects
 * on a given line of their form, and whether this business is on the cash scheme at all, is
 * between the business and their accountant.
 */

export type VatReturn = {
  range: DateRange;
  sales: VatSide;
  purchases: VatSide;
  /** Output VAT less input VAT. Positive is owed to ZATCA; negative is reclaimable. */
  netVat: number;
  /** Every source that fed the figures, so a reader can see what is and is not included. */
  sources: { label: string; documents: number; net: number; vat: number }[];
};

/** A document's contribution: the taxable base (after discount) and the VAT on it. */
type Totals = { net: number; vat: number; count: number };

const ZERO: Totals = { net: 0, vat: 0, count: 0 };

/**
 * Sums one kind of document.
 *
 * The taxable base is `subtotal − discountTotal`: VAT is charged on what the customer actually
 * pays, so the base has to be the discounted amount or the two will not reconcile.
 */
async function sum(
  rows: { subtotal: unknown; discountTotal: unknown; vatTotal: unknown }[],
): Promise<Totals> {
  return rows.reduce<Totals>(
    (total, row) => ({
      net: round2(total.net + num(row.subtotal as number) - num(row.discountTotal as number)),
      vat: round2(total.vat + num(row.vatTotal as number)),
      count: total.count + 1,
    }),
    ZERO,
  );
}

export async function getVatReturn(range: DateRange): Promise<VatReturn> {
  const date = dateWhere(range);
  const money = { subtotal: true, discountTotal: true, vatTotal: true } as const;

  const [invoices, posSales, creditNotes, posReturns, purchases, purchaseReturns, expenses] = await Promise.all([
    // A draft has not been issued, so it is not a tax document yet.
    db.invoice.findMany({ where: { date, status: { not: "DRAFT" } }, select: money }),
    // A held bill has taken no money and is not a receipt; a voided one never happened.
    db.posSale.findMany({ where: { date, status: { notIn: ["VOIDED", "PARKED"] } }, select: money }),
    db.creditNote.findMany({ where: { date, status: "ISSUED" }, select: money }),
    db.posReturn.findMany({ where: { date }, select: money }),
    // Input VAT is only reclaimable on what has actually been received.
    db.purchase.findMany({ where: { date, receivedAt: { not: null } }, select: money }),
    db.purchaseReturn.findMany({ where: { date, status: "ISSUED" }, select: money }),
    /**
     * General expenses with VAT on them. Rent, couriers and fees are bought on a tax invoice
     * like anything else, and leaving them out understated the reclaim every quarter.
     * `amount` is VAT-inclusive here, so the taxable base is what is left after the tax.
     */
    db.expense.findMany({ where: { date, vatAmount: { gt: 0 } }, select: { amount: true, vatAmount: true } }),
  ]);

  const line = (rows: { subtotal: unknown; discountTotal: unknown; vatTotal: unknown }[]) =>
    rows.map((row) => ({
      net: round2(num(row.subtotal as number) - num(row.discountTotal as number)),
      vat: num(row.vatTotal as number),
    }));

  const sales = buildSide([...line(invoices), ...line(posSales)], [...line(creditNotes), ...line(posReturns)]);
  const expenseLines = expenses.map((row) => ({
    net: round2(num(row.amount as unknown as number) - num(row.vatAmount as unknown as number)),
    vat: num(row.vatAmount as unknown as number),
  }));
  const purchasesSide = buildSide([...line(purchases), ...expenseLines], line(purchaseReturns));

  const totals = await Promise.all([
    sum(invoices),
    sum(posSales),
    sum(creditNotes),
    sum(posReturns),
    sum(purchases),
    sum(purchaseReturns),
    // An expense has no subtotal/discount of its own, so its base is shaped to match.
    sum(expenses.map((row) => ({ subtotal: row.amount, discountTotal: row.vatAmount, vatTotal: row.vatAmount }))),
  ]);
  const labels = ["Invoices", "POS sales", "Credit notes", "POS returns", "Purchases received", "Goods sent back", "Expenses with VAT"];
  const signs = [1, 1, -1, -1, 1, -1, 1];

  return {
    range,
    sales,
    purchases: purchasesSide,
    // Positive is owed to ZATCA, negative is reclaimable from them.
    netVat: round2(sales.vat - purchasesSide.vat),
    sources: totals.map((total, index) => ({
      label: labels[index],
      documents: total.count,
      net: round2(total.net * signs[index]),
      vat: round2(total.vat * signs[index]),
    })),
  };
}
