import type { Metadata } from "next";
import { PaymentTermsForm } from "@/components/settings/payment-terms-form";
import { requirePermission } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Payment Terms" };

export default async function PaymentTermsSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const settings = await getAppSettings();
  return <PaymentTermsForm settings={settings} canEdit={auth.can("SETTINGS", "edit")} />;
}
