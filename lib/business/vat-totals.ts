import { round2 } from "./totals";

/**
 * How a VAT return adds up, with no database attached.
 *
 * Pure and client-safe, kept out of the engine for the usual reason: these figures go on a filing
 * and on a screen, and there must be one of them. The engine fetches the documents; this decides
 * what they come to.
 */

/** One side of the return: what it was worth before VAT, and the VAT itself. */
export type VatSide = {
  /** Sales or purchases that carried VAT, excluding the VAT. */
  standardRatedNet: number;
  standardRatedVat: number;
  /** Everything with no VAT on it — zero-rated, exempt, or simply not taxed here. */
  zeroRatedNet: number;
  /** Credits and returns, which reduce the above. Kept separate so nothing is hidden. */
  adjustmentsNet: number;
  adjustmentsVat: number;
  /** After adjustments: what goes on the return. */
  net: number;
  vat: number;
};

/** A document's contribution: its taxable base (after discount) and the VAT charged on it. */
export type VatDocument = { net: number; vat: number };

/** Builds one side of the return from what was charged and what was credited back. */
export function buildSide(charged: VatDocument[], credited: VatDocument[]): VatSide {
  let standardRatedNet = 0;
  let standardRatedVat = 0;
  let zeroRatedNet = 0;
  for (const row of charged) {
    if (row.vat > 0) {
      standardRatedNet = round2(standardRatedNet + row.net);
      standardRatedVat = round2(standardRatedVat + row.vat);
    } else {
      zeroRatedNet = round2(zeroRatedNet + row.net);
    }
  }

  const adjustmentsNet = round2(credited.reduce((total, row) => total + row.net, 0));
  const adjustmentsVat = round2(credited.reduce((total, row) => total + row.vat, 0));
  return {
    standardRatedNet,
    standardRatedVat,
    zeroRatedNet,
    adjustmentsNet,
    adjustmentsVat,
    // Credits come **off**. Getting this sign wrong produces a bigger number that still looks
    // like money, and it would be paid.
    net: round2(standardRatedNet + zeroRatedNet - adjustmentsNet),
    vat: round2(standardRatedVat - adjustmentsVat),
  };
}
