import type { Metadata } from "next";
import { StockTable } from "@/components/items/stock-table";
import { StockValuationCards } from "@/components/items/stock-valuation";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { getStockValuation, listStock } from "@/lib/data/items";
import { getCurrentBranch, listTransferDestinations } from "@/lib/data/platform";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Stock" };

export default async function StockPage({ searchParams }: PageProps<"/pos/stock">) {
  const auth = await requireModule("POS", "INVENTORY", "view");
  const params = parseListParams(await searchParams, "active");
  // Stock may be sent to any active branch, including ones this user does not work at.
  const [branch, branches] = await Promise.all([getCurrentBranch(), listTransferDestinations()]);
  const [{ items, total, lowCount }, valuation] = await Promise.all([listStock(params, branch.id), getStockValuation(branch.id)]);

  return (
    <>
      <PageHeader title="Stock" description={`On-hand quantities in ${branch.name}, with the movements behind every number.`} />
      {/* Valued at cost across the whole branch, not just the page on screen. */}
      <StockValuationCards valuation={valuation} branchName={branch.name} />
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
