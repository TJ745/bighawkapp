import type { Metadata } from "next";
import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerOptions, listSupplierOptions } from "@/lib/data/parties";
import { listProjectOptions } from "@/lib/data/projects";
import { getDocumentFormSettings, today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "New Purchase" };

export default async function NewPurchasePage({ searchParams }: PageProps<"/procurement/purchases/new">) {
  await requirePermission("PROCUREMENT", "create");
  const { supplier } = await searchParams;
  const [suppliers, customers, projects, settings, todayDate] = await Promise.all([
    listSupplierOptions(),
    listCustomerOptions(),
    listProjectOptions(),
    getDocumentFormSettings(),
    today(),
  ]);
  return (
    <>
      <PageHeader title="New Purchase" />
      <DocumentForm
        kind="purchase"
        parties={suppliers}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: `${p.code} · ${p.name}`, customerId: p.customerId }))}
        settings={settings}
        today={todayDate}
        partyId={typeof supplier === "string" ? supplier : undefined}
      />
    </>
  );
}
