import type { Metadata } from "next";
import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerOptions } from "@/lib/data/parties";
import { listProjectOptions } from "@/lib/data/projects";
import { getDocumentFormSettings, today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "New Quotation" };

export default async function NewQuotationPage({ searchParams }: PageProps<"/sales/quotations/new">) {
  await requirePermission("SALES", "create");
  const { customer } = await searchParams;
  const [customers, projects, settings, todayDate] = await Promise.all([listCustomerOptions(), listProjectOptions(), getDocumentFormSettings(), today()]);
  return (
    <>
      <PageHeader title="New Quotation" />
      <DocumentForm
        kind="quotation"
        parties={customers}
        projects={projects.map((p) => ({ id: p.id, name: `${p.code} · ${p.name}`, customerId: p.customerId }))}
        settings={settings}
        today={todayDate}
        partyId={typeof customer === "string" ? customer : undefined}
      />
    </>
  );
}
