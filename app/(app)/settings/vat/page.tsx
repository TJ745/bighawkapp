import type { Metadata } from "next";
import { VatForm } from "@/components/settings/vat-form";
import { requirePermission } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "VAT Settings" };

export default async function VatSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const settings = await getAppSettings();
  return <VatForm settings={settings} canEdit={auth.can("SETTINGS", "edit")} />;
}
