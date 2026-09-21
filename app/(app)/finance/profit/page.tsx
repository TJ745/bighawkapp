import type { Metadata } from "next";
import { ProfitView } from "@/components/finance/profit-view";
import { resolveRange } from "@/lib/date-range";
import { requirePermission } from "@/lib/auth/session";
import { getAccountBalances, getFinanceTotals } from "@/lib/business/finance";
import { today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "Profit" };

export default async function ProfitPage({ searchParams }: PageProps<"/finance/profit">) {
  await requirePermission("FINANCE", "view");
  const raw = await searchParams;
  const todayDate = await today();
  const range = resolveRange(raw, todayDate, "this-month");
  const [totals, accounts] = await Promise.all([getFinanceTotals(range), getAccountBalances()]);
  return <ProfitView totals={totals} accounts={accounts} today={todayDate} />;
}
