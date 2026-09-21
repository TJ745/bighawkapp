import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DocumentForm } from "@/components/documents/document-form";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listCustomerOptions, listSupplierOptions } from "@/lib/data/parties";
import { getPurchase } from "@/lib/data/procurement";
import { listProjectOptions } from "@/lib/data/projects";
import { getDocumentFormSettings, today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "Edit Purchase" };

export default async function EditPurchasePage({ params }: PageProps<"/procurement/purchases/[id]/edit">) {
  const { id } = await params;
  await requirePermission("PROCUREMENT", "edit");
  const purchase = await getPurchase(id);
  if (!purchase) notFound();
  const [suppliers, customers, projects, settings, todayDate] = await Promise.all([
    listSupplierOptions(),
    listCustomerOptions(),
    listProjectOptions(),
    getDocumentFormSettings(),
    today(),
  ]);
  return (
    <>
      <PageHeader
        title={`Edit ${purchase.number}`}
        description={purchase.paidTotal > 0 ? "Payments have been recorded; the total cannot go below the amount paid." : undefined}
      />
      <DocumentForm
        kind="purchase"
        parties={suppliers}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        projects={projects.map((p) => ({ id: p.id, name: `${p.code} · ${p.name}`, customerId: p.customerId }))}
        settings={settings}
        today={todayDate}
        document={purchase}
      />
    </>
  );
}
