import "server-only";
import { getCompanySettings, isZatcaActive } from "@/lib/data/settings";
import { ZatcaLabel, type BiLabel } from "@/lib/zatca/labels";
import { buildPhase1QrPayload } from "@/lib/zatca/qr";
import { qrPath, type QrPath } from "@/lib/zatca/qr-image";
import { documentKindFor, type ZatcaDocumentKind } from "@/lib/zatca/seller";

/**
 * What a document needs in order to be a Saudi tax invoice: the right title, and the QR code.
 *
 * Every document that goes to a customer asks for this one thing — the invoice PDF, the credit
 * note, the till receipt — so the figures inside the QR are always the figures on the paper. It is
 * built server-side from the stored document, never from anything the browser sent, for the same
 * reason prices are: the QR is a statement to the tax authority about what was charged.
 */
export type ZatcaStamp = {
  /** Standard (the buyer is VAT-registered) or simplified (everyone else). */
  kind: ZatcaDocumentKind;
  /** The document's title, in both languages. */
  title: BiLabel;
  /** The QR, ready to draw. */
  qr: QrPath;
  /** The same QR as its base64 payload — kept so it can be read back and checked. */
  payload: string;
};

export type ZatcaStampInput = {
  /** Which document this is: a credit note is titled as one, whoever it is for. */
  document: "INVOICE" | "CREDIT_NOTE";
  /** The buyer, whose VAT number decides standard against simplified. Null for a walk-in. */
  buyer: { vatNumber?: string | null } | null;
  /** When the document was issued. */
  issuedAt: Date;
  /** The total the customer pays, VAT included. */
  totalWithVat: number;
  /** The VAT within that total. */
  vatTotal: number;
};

/**
 * Builds the stamp, or returns null when e-invoicing is switched off — which is what leaves every
 * document in a non-Saudi or still-being-set-up deployment exactly as it was.
 */
export async function zatcaStamp(input: ZatcaStampInput): Promise<ZatcaStamp | null> {
  if (!(await isZatcaActive())) return null;
  const company = await getCompanySettings();

  // The seller name in the QR is the registered legal name, which is the Arabic one where the
  // company has recorded it. The mode cannot be switched on without it, so this rarely falls back.
  const sellerName = company.companyNameAr?.trim() || company.companyName.trim();
  const payload = buildPhase1QrPayload({
    sellerName,
    vatNumber: company.vatNumber ?? "",
    issuedAt: input.issuedAt,
    totalWithVat: input.totalWithVat,
    vatTotal: input.vatTotal,
  });

  const kind = documentKindFor(input.buyer);
  const title =
    input.document === "CREDIT_NOTE" ? ZatcaLabel.creditNote : kind === "STANDARD" ? ZatcaLabel.taxInvoice : ZatcaLabel.simplifiedTaxInvoice;

  return { kind, title, qr: qrPath(payload), payload };
}
