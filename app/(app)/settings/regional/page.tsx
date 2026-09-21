import type { Metadata } from "next";
import { RegionalForm } from "@/components/settings/regional-form";
import { requirePermission } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Date & Regional" };

export default async function RegionalSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const settings = await getAppSettings();
  return <RegionalForm settings={settings} canEdit={auth.can("SETTINGS", "edit")} />;
}
