import type { Metadata } from "next";
import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listSupplierOptions } from "@/lib/data/parties";
import { getDocumentFormSettings, today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "New Supplier Quotation" };

export default async function NewSupplierQuotationPage({ searchParams }: PageProps<"/procurement/supplier-quotations/new">) {
  await requirePermission("PROCUREMENT", "create");
  const { supplier } = await searchParams;
  const [suppliers, settings, todayDate] = await Promise.all([listSupplierOptions(), getDocumentFormSettings(), today()]);
  return (
    <>
      <PageHeader title="New Supplier Quotation" description="Record an offer you received from a supplier." />
      <DocumentForm
        kind="supplier-quotation"
        parties={suppliers}
        settings={settings}
        today={todayDate}
        partyId={typeof supplier === "string" ? supplier : undefined}
      />
    </>
  );
}
