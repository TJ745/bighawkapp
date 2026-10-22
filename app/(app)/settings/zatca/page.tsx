import type { Metadata } from "next";
import { ZatcaForm } from "@/components/settings/zatca-form";
import { requirePermission } from "@/lib/auth/session";
import { getCompanySettings, getZatcaSettings } from "@/lib/data/settings";
import { sellerProblems } from "@/lib/zatca/seller";

export const metadata: Metadata = { title: "E-invoicing (ZATCA)" };

export default async function ZatcaSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const [zatca, company] = await Promise.all([getZatcaSettings(), getCompanySettings()]);
  // The same check the action makes, so the screen never offers a switch the action would refuse.
  return <ZatcaForm mode={zatca.mode} problems={sellerProblems(company)} canEdit={auth.can("SETTINGS", "edit")} />;
}
