import "server-only";
import { cache } from "react";
import { getCompanySettings } from "@/lib/data/settings";

// Fallback used until a company name has been saved (Settings → Company).
export const APP_NAME = "BigHawk";

export type Branding = { companyName: string; logoUrl: string | null };

// Single source for company branding used by the shell, login screen, PDFs and emails.
export const getBranding = cache(async (): Promise<Branding> => {
  const company = await getCompanySettings();
  return { companyName: company.companyName.trim() || APP_NAME, logoUrl: company.logoUrl };
});
