import type { Metadata } from "next";
import { SalesTable } from "@/components/pos/sales-table";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listSales } from "@/lib/data/pos";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "POS Sales" };

export default async function PosSalesPage({ searchParams }: PageProps<"/pos/sales">) {
  await requireModule("POS", "POS", "view");
  const params = parseListParams(await searchParams);
  const branch = await getCurrentBranch();
  const { sales, total, takings, refunds, netSales, cost } = await listSales(params, branch.id);

  return (
    <>
      <PageHeader title="POS Sales" description={`Everything rung up at ${branch.name}.`} />
      <SalesTable
        sales={sales}
        total={total}
        page={params.page}
        takings={takings}
        refunds={refunds}
        netSales={netSales}
        cost={cost}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        branchName={branch.name}
      />
    </>
  );
}
