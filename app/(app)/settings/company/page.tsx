import type { Metadata } from "next";
import { CompanyForm } from "@/components/settings/company-form";
import { requirePermission } from "@/lib/auth/session";
import { getCompanySettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Company Settings" };

export default async function CompanySettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const company = await getCompanySettings();
  return <CompanyForm company={company} canEdit={auth.can("SETTINGS", "edit")} />;
}
