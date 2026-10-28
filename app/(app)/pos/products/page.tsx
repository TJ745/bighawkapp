import type { Metadata } from "next";
import { ItemsTable } from "@/components/items/items-table";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { listItems } from "@/lib/data/items";
import { getCurrentBranch, listBranches } from "@/lib/data/platform";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Products & Services" };

export default async function ProductsPage({ searchParams }: PageProps<"/pos/products">) {
  const auth = await requireModule("POS", "INVENTORY", "view");
  const params = parseListParams(await searchParams);
  const branch = await getCurrentBranch();
  // The "Sold at" column earns its place only where a company has shops to tell apart.
  const [{ items, total }, allBranches] = await Promise.all([listItems(params, branch.id), listBranches()]);
  const showBranch = allBranches.filter((b) => b.isActive).length > 1;

  return (
    <>
      <PageHeader title="Products & Services" description="Everything you sell — stocked goods and the work you perform." />
      <ItemsTable
        items={items}
        total={total}
        page={params.page}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        canCreate={auth.can("INVENTORY", "create")}
        canEdit={auth.can("INVENTORY", "edit")}
        branchName={branch.name}
        showBranch={showBranch}
      />
    </>
  );
}
