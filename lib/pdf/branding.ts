import "server-only";
import { cache } from "react";
import { getAppSettings, getCompanySettings } from "@/lib/data/settings";
import { readStoredFile } from "@/lib/storage";
import type { PdfBranding } from "./document-pdf";

/** Branding for PDFs, assembled from Settings → Company and Settings → Document & Email Styling. */
export const getPdfBranding = cache(async (): Promise<PdfBranding> => {
  const [company, settings] = await Promise.all([getCompanySettings(), getAppSettings()]);
  const logoKey = company.logoUrl?.startsWith("/api/files/") ? company.logoUrl.slice("/api/files/".length) : null;
  const logo = logoKey ? await readStoredFile(logoKey) : null;

  const companyLines = [
    company.address,
    company.nationalAddress ? `National address: ${company.nationalAddress}` : null,
    company.vatNumber ? `VAT No. ${company.vatNumber}` : null,
    company.crNumber ? `CR No. ${company.crNumber}` : null,
    [company.phone, company.email, company.website].filter(Boolean).join(" · ") || null,
  ].filter((l): l is string => Boolean(l));

  return {
    companyName: company.companyName.trim() || "Company",
    logo: logo && logo.mimeType !== "application/pdf" && logo.mimeType !== "image/webp" ? logo : null,
    companyLines,
    primaryColor: settings.primaryColor,
    secondaryColor: settings.secondaryColor,
    font: settings.pdfFont,
    headerStyle: settings.pdfHeaderStyle,
    footerText: settings.pdfFooterText,
  };
});

export type CompanyBankLines = string[];

/** Bank details from Company settings as printable lines (empty when none configured). */
export async function getCompanyBankLines(): Promise<CompanyBankLines> {
  const company = await getCompanySettings();
  return [
    company.bankName ? `Bank: ${company.bankName}` : null,
    company.accountName ? `Account name: ${company.accountName}` : null,
    company.iban ? `IBAN: ${company.iban}` : null,
    company.accountNumber ? `Account number: ${company.accountNumber}` : null,
  ].filter((l): l is string => Boolean(l));
}
