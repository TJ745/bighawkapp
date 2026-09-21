import type { Metadata } from "next";
import { SecurityForm } from "@/components/settings/security-form";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Security Settings" };

export default async function SecuritySettingsPage() {
  const auth = await requireSuperAdmin();
  const settings = await getAppSettings();
  return <SecurityForm settings={settings} canEdit={auth.can("SETTINGS", "edit")} />;
}
