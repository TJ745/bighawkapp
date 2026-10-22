import type { Metadata } from "next";
import { StockTable } from "@/components/items/stock-table";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { listStock } from "@/lib/data/items";
import { getCurrentBranch, listActiveBranches } from "@/lib/data/platform";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: PageProps<"/pos/stock">) {
  const auth = await requireModule("POS", "INVENTORY", "view");
  const params = parseListParams(await searchParams, "active");
  const [branch, branches] = await Promise.all([getCurrentBranch(), listActiveBranches()]);
  const { items, total, lowCount } = await listStock(params, branch.id);

  return (
    <>
      <PageHeader title="Stock" description={`On-hand quantities in ${branch.name}, with the movements behind every number.`} />
      <StockTable
        rows={items}
        total={total}
        page={params.page}
        lowCount={lowCount}
        hasQuery={Boolean(params.q)}
        canEdit={auth.can("INVENTORY", "edit")}
        branch={{ id: branch.id, name: branch.name }}
        branches={branches.map((b) => ({ id: b.id, name: b.name }))}
      />
    </>
  );
}
