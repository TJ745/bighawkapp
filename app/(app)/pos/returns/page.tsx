import type { Metadata } from "next";
import { ReturnsTable } from "@/components/pos/returns-table";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listReturns } from "@/lib/data/pos";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Returns" };

export default async function ReturnsPage({ searchParams }: PageProps<"/pos/returns">) {
  await requireModule("POS", "POS", "view");
  const params = parseListParams(await searchParams);
  const branch = await getCurrentBranch();
  const { returns, total, refunded, cost } = await listReturns(params, branch.id);

  return (
    <>
      <PageHeader title="Returns" description={`Goods brought back to ${branch.name} and what was refunded.`} />
      <ReturnsTable
        returns={returns}
        total={total}
        page={params.page}
        refunded={refunded}
        cost={cost}
        hasQuery={Boolean(params.q) || params.filter !== "all"}
        branchName={branch.name}
      />
    </>
  );
}
