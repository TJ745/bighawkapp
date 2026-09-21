import type { Metadata } from "next";
import { QuotationsTable } from "@/components/sales/quotations-table";
import { PageHeader } from "@/components/shared/page-header";
import { requirePermission } from "@/lib/auth/session";
import { listQuotations } from "@/lib/data/sales";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: PageProps<"/sales/quotations">) {
  const auth = await requirePermission("SALES", "view");
  const params = parseListParams(await searchParams);
  const { items, total } = await listQuotations(params);
  return (
    <>
      <PageHeader title="Quotations" description="Price offers sent to customers. Accepted quotations become invoices." />
      <QuotationsTable
        items={items}
        total={total}
        page={params.page}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        canCreate={auth.can("SALES", "create")}
        canEdit={auth.can("SALES", "edit")}
      />
    </>
  );
}
