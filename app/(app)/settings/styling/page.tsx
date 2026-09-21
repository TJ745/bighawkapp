import type { Metadata } from "next";
import { EmailTemplatesForm } from "@/components/settings/email-templates-form";
import { StylingForm } from "@/components/settings/styling-form";
import { requireSuperAdmin } from "@/lib/auth/session";
import { getAppSettings, getEmailTemplates } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Document & Email Styling" };

export default async function StylingSettingsPage() {
  const auth = await requireSuperAdmin();
  const [settings, templates] = await Promise.all([getAppSettings(), getEmailTemplates()]);
  const canEdit = auth.can("SETTINGS", "edit");
  return (
    <>
      <StylingForm settings={settings} canEdit={canEdit} />
      <EmailTemplatesForm templates={templates} canEdit={canEdit} />
    </>
  );
}
