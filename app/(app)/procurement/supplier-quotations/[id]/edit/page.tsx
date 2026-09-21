import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listSupplierOptions } from "@/lib/data/parties";
import { getSupplierQuotation } from "@/lib/data/procurement";
import { getDocumentFormSettings, today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "Edit Supplier Quotation" };

export default async function EditSupplierQuotationPage({ params }: PageProps<"/procurement/supplier-quotations/[id]/edit">) {
  const { id } = await params;
  await requirePermission("PROCUREMENT", "edit");
  const quotation = await getSupplierQuotation(id);
  if (!quotation) notFound();
  // Decided or converted quotations are read-only.
  if (quotation.status === "ACCEPTED" || quotation.status === "REJECTED" || quotation.purchase) {
    redirect(`/procurement/supplier-quotations/${id}`);
  }
  const [suppliers, settings, todayDate] = await Promise.all([listSupplierOptions(), getDocumentFormSettings(), today()]);
  return (
    <>
      <PageHeader title={`Edit ${quotation.number}`} />
      <DocumentForm kind="supplier-quotation" parties={suppliers} settings={settings} today={todayDate} document={quotation} />
    </>
  );
}
