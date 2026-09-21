import type { Metadata } from "next";
import { EmailForm } from "@/components/settings/email-form";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getEmailSettingsView } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Email Settings" };

export default async function EmailSettingsPage() {
  const auth = await requireSuperAdmin();
  const settings = await getEmailSettingsView();
  return <EmailForm settings={settings} adminEmail={auth.user.email} />;
}
