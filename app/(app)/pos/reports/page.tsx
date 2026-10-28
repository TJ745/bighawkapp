import type { Metadata } from "next";
import { SalesReportView } from "@/components/pos/sales-report";
import { requireModule } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { getSalesByItem } from "@/lib/data/pos-reports";
import { today } from "@/lib/data/sales";
import { resolveRange } from "@/lib/date-range";

export const metadata: Metadata = { title: "What sold" };

export default async function PosReportsPage({ searchParams }: PageProps<"/pos/reports">) {
  // The same permission as the sales history: this is that list, grouped.
  await requireModule("POS", "POS", "view");
  const raw = await searchParams;
  const todayDate = await today();
  const range = resolveRange(raw, todayDate, "this-month");
  const branch = await getCurrentBranch();
  const data = await getSalesByItem(range, branch.id);
  return <SalesReportView data={data} branchName={branch.name} today={todayDate} />;
}
