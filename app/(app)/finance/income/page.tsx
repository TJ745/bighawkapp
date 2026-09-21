import type { Metadata } from "next";
import { EntriesTable } from "@/components/finance/entries-table";
import { presetRange, resolveRange } from "@/lib/date-range";
import { StatCards } from "@/components/shared/stat-cards";
import { requirePermission } from "@/lib/auth/session";
import { getFinanceTotals, listIncomeEntries } from "@/lib/business/finance";
import { getOtherIncome, listFinanceCategories } from "@/lib/data/finance";
import { refreshSalesStatuses, today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Income" };

export default async function IncomePage({ searchParams }: PageProps<"/finance/income">) {
  const auth = await requirePermission("FINANCE", "view");
  const raw = await searchParams;
  const todayDate = await today();
  await refreshSalesStatuses();
  const range = resolveRange(raw, todayDate, "this-month");
  const type = raw.type === "customer-payment" || raw.type === "other-income" ? raw.type : undefined;
  const accountId = typeof raw.account === "string" ? raw.account : undefined;
  const entryId = typeof raw.entry === "string" ? raw.entry : undefined;

  const [entries, all, month, day, categories, accounts, activeEntry] = await Promise.all([
    listIncomeEntries(range, { type, accountId }),
    getFinanceTotals({ from: null, to: null }),
    getFinanceTotals(presetRange("this-month", todayDate)),
    getFinanceTotals(presetRange("today", todayDate)),
    listFinanceCategories("INCOME"),
    listPaymentAccounts(),
    entryId ? getOtherIncome(entryId) : null,
  ]);

  return (
    <div className="space-y-6">
      <StatCards
        stats={[
          { label: "Total income", value: all.totalIncome, hint: "All time", tone: "success" },
          { label: "This month", value: month.totalIncome },
          { label: "Today", value: day.totalIncome },
        ]}
      />
      <EntriesTable
        kind="income"
        entries={entries}
        categories={categories}
        accounts={accounts.filter((a) => a.isActive).map((a) => ({ id: a.id, name: a.name }))}
        today={todayDate}
        canCreate={auth.can("FINANCE", "create")}
        canEdit={auth.can("FINANCE", "edit")}
        activeEntry={activeEntry}
      />
    </div>
  );
}
