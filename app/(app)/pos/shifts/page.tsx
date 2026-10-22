import type { Metadata } from "next";
import { ShiftsTable } from "@/components/pos/shifts-table";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listShifts } from "@/lib/data/pos";
import { parseListParams } from "@/lib/list-params";

export const metadata: Metadata = { title: "Shifts" };

export default async function ShiftsPage({ searchParams }: PageProps<"/pos/shifts">) {
  await requireModule("POS", "POS", "view");
  const params = parseListParams(await searchParams);
  const branch = await getCurrentBranch();
  const { shifts, total } = await listShifts(params, branch.id);

  return (
    <>
      <PageHeader title="Shifts" description={`Drawer sessions at ${branch.name}, with what was counted against what was expected.`} />
      <ShiftsTable shifts={shifts} total={total} page={params.page} />
    </>
  );
}
