import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SupplierQuotationDetailView } from "@/components/procurement/supplier-quotation-detail";
import { requirePermission } from "@/lib/auth/session";
import { getSupplierQuotation } from "@/lib/data/procurement";
import { getAppSettings } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Supplier Quotation" };

export default async function SupplierQuotationPage({ params }: PageProps<"/procurement/supplier-quotations/[id]">) {
  const { id } = await params;
  const auth = await requirePermission("PROCUREMENT", "view");
  const [quotation, settings] = await Promise.all([getSupplierQuotation(id), getAppSettings()]);
  if (!quotation) notFound();
  return (
    <SupplierQuotationDetailView
      quotation={quotation}
      canEdit={auth.can("PROCUREMENT", "edit")}
      canCreate={auth.can("PROCUREMENT", "create")}
      showVat={settings.vatEnabled}
    />
  );
}
