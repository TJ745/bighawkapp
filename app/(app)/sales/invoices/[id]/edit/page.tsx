import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerOptions } from "@/lib/data/parties";
import { listProjectOptions } from "@/lib/data/projects";
import { getDocumentFormSettings, getInvoice, today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "Edit Invoice" };

export default async function EditInvoicePage({ params }: PageProps<"/sales/invoices/[id]/edit">) {
  const { id } = await params;
  await requirePermission("SALES", "edit");
  const invoice = await getInvoice(id);
  if (!invoice) notFound();
  const [customers, projects, settings, todayDate] = await Promise.all([listCustomerOptions(), listProjectOptions(), getDocumentFormSettings(), today()]);
  return (
    <>
      <PageHeader
        title={`Edit ${invoice.number}`}
        description={invoice.paidTotal > 0 ? "Payments have been recorded; the total cannot go below the amount paid." : undefined}
      />
      <DocumentForm kind="invoice" parties={customers} projects={projects.map((p) => ({ id: p.id, name: `${p.code} · ${p.name}`, customerId: p.customerId }))} settings={settings} today={todayDate} document={invoice} />
    </>
  );
}
