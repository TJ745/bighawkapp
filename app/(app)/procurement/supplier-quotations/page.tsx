import type { Metadata } from "next";
import { SupplierQuotationsTable } from "@/components/procurement/supplier-quotations-table";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listSupplierQuotations } from "@/lib/data/procurement";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Supplier Quotations" };

export default async function SupplierQuotationsPage({ searchParams }: PageProps<"/procurement/supplier-quotations">) {
  const auth = await requirePermission("PROCUREMENT", "view");
  const params = parseListParams(await searchParams);
  const { items, total } = await listSupplierQuotations(params);
  return (
    <>
      <PageHeader title="Supplier Quotations" description="Price offers received from suppliers. Accepted quotations become purchases." />
      <SupplierQuotationsTable
        items={items}
        total={total}
        page={params.page}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        canCreate={auth.can("PROCUREMENT", "create")}
        canEdit={auth.can("PROCUREMENT", "edit")}
      />
    </>
  );
}
