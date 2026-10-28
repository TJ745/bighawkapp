import type { Metadata } from "next";
import { CompaniesManager } from "@/components/settings/companies-manager";
import { requireSuperAdmin } from "@/lib/auth/session";
import { actingCompanyId, listCompanies } from "@/lib/data/companies";

export const metadata: Metadata = { title: "Companies" };

export default async function CompaniesSettingsPage() {
  // The one screen that looks across customers, so the one screen only BigHawk's own operator opens.
  await requireSuperAdmin();
  const [companies, actingId] = await Promise.all([listCompanies(), actingCompanyId()]);
  return <CompaniesManager companies={companies} actingId={actingId} baseDomain={process.env.TENANT_BASE_DOMAIN ?? null} />;
}
