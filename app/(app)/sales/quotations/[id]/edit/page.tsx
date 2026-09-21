import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerOptions } from "@/lib/data/parties";
import { listProjectOptions } from "@/lib/data/projects";
import { getDocumentFormSettings, getQuotation, today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "Edit Quotation" };

export default async function EditQuotationPage({ params }: PageProps<"/sales/quotations/[id]/edit">) {
  const { id } = await params;
  await requirePermission("SALES", "edit");
  const quotation = await getQuotation(id);
  if (!quotation) notFound();
  // Decided or converted quotations are read-only.
  if (quotation.status === "ACCEPTED" || quotation.status === "REJECTED" || quotation.invoice) redirect(`/sales/quotations/${id}`);
  const [customers, projects, settings, todayDate] = await Promise.all([listCustomerOptions(), listProjectOptions(), getDocumentFormSettings(), today()]);
  return (
    <>
      <PageHeader title={`Edit ${quotation.number}`} description="Saving a sent quotation returns it to draft so it can be sent again." />
      <DocumentForm kind="quotation" parties={customers} projects={projects.map((p) => ({ id: p.id, name: `${p.code} · ${p.name}`, customerId: p.customerId }))} settings={settings} today={todayDate} document={quotation} />
    </>
  );
}
