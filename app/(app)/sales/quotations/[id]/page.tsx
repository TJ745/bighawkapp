import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuotationDetailView } from "@/components/sales/quotation-detail";
import { requirePermission } from "@/lib/auth/session";
import { getQuotation } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";
import { isEmailConfigured } from "@/lib/email/mailer";

export const metadata: Metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: PageProps<"/sales/quotations/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("SALES", "view");
  const [quotation, settings] = await Promise.all([getQuotation(id), getAppSettings()]);
  if (!quotation) notFound();
  return (
    <QuotationDetailView
      quotation={quotation}
      canEdit={auth.can("SALES", "edit")}
      canCreate={auth.can("SALES", "create")}
      emailConfigured={await isEmailConfigured()}
      showVat={settings.vatEnabled}
    />
  );
}
