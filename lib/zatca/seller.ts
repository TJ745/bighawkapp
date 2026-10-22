/**
 * Who the seller is, as a Saudi tax invoice has to state it — and which kind of invoice to issue.
 *
 * Pure and client-safe: the settings screen uses it to say what is still missing, and the server
 * uses the same functions to decide what to print. One set of rules, so the screen cannot promise
 * something the document does not do.
 */

/**
 * A Saudi VAT registration number is 15 digits that begin and end with 3.
 *
 * It is worth checking, because the number goes into the QR code: a wrong one produces a QR that
 * scans perfectly and states the wrong taxpayer, which is the hardest kind of error to notice.
 */
export function isValidVatNumber(value: string | null | undefined): boolean {
  const clean = (value ?? "").trim();
  return /^3\d{13}3$/.test(clean);
}

/** The seller identity the fields below are checked against. */
export type SellerIdentity = {
  companyName: string | null;
  companyNameAr: string | null;
  vatNumber: string | null;
  buildingNumber: string | null;
  streetName: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
};

/**
 * What is still missing before this company can issue a compliant tax invoice.
 *
 * These are the fields a tax invoice must carry, so they are also the gate on turning Phase 1 on:
 * printing a QR code built from half-filled settings would be worse than printing none, because it
 * looks finished. Each entry is a sentence a non-technical user can act on.
 */
export function sellerProblems(seller: SellerIdentity): string[] {
  const problems: string[] = [];
  const has = (value: string | null) => Boolean(value && value.trim());

  if (!has(seller.companyName)) problems.push("The company name is missing.");
  if (!has(seller.companyNameAr)) problems.push("The company's legal name in Arabic is missing — a tax invoice must be issued in Arabic.");

  if (!has(seller.vatNumber)) {
    problems.push("The VAT registration number is missing.");
  } else if (!isValidVatNumber(seller.vatNumber)) {
    problems.push("The VAT registration number must be 15 digits beginning and ending with 3.");
  }

  if (!has(seller.buildingNumber)) problems.push("The building number is missing from the company address.");
  if (!has(seller.streetName)) problems.push("The street name is missing from the company address.");
  if (!has(seller.district)) problems.push("The district is missing from the company address.");
  if (!has(seller.city)) problems.push("The city is missing from the company address.");
  if (!has(seller.postalCode)) problems.push("The postal code is missing from the company address.");

  return problems;
}

/**
 * The two kinds of document ZATCA recognises.
 *
 * STANDARD is the business-to-business tax invoice: it names the buyer and carries their VAT
 * number. SIMPLIFIED is the business-to-consumer one — every till receipt — and it is the kind that
 * must carry the QR code. In Phase 2 these take different routes to ZATCA (clearance before the
 * buyer gets it, against reporting within 24 hours), which is why the distinction is drawn here
 * and not left implicit in a template.
 */
export type ZatcaDocumentKind = "STANDARD" | "SIMPLIFIED";

/**
 * A sale to a VAT-registered buyer is a standard tax invoice; anything else is simplified.
 *
 * The buyer's own VAT number is what decides it, so a walk-in customer and a registered business
 * are told apart by the record rather than by who typed the invoice.
 */
export function documentKindFor(buyer: { vatNumber?: string | null } | null | undefined): ZatcaDocumentKind {
  return buyer && isValidVatNumber(buyer.vatNumber) ? "STANDARD" : "SIMPLIFIED";
}

/** The seller's national address as printable lines, in ZATCA's component order. */
export function sellerAddressLines(seller: {
  buildingNumber: string | null;
  streetName: string | null;
  additionalNumber: string | null;
  district: string | null;
  city: string | null;
  postalCode: string | null;
  region: string | null;
}): string[] {
  const building = [seller.buildingNumber, seller.streetName].filter((v) => v?.trim()).join(" ");
  const area = [seller.district, seller.city].filter((v) => v?.trim()).join(", ");
  const codes = [seller.postalCode, seller.additionalNumber].filter((v) => v?.trim()).join(" — ");
  return [building, area, codes, seller.region?.trim() ? seller.region : null].filter((line): line is string => Boolean(line && line.trim()));
}
