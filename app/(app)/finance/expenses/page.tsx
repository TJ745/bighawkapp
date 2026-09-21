import type { Metadata } from "next";
import { EntriesTable } from "@/components/finance/entries-table";
import { presetRange, resolveRange } from "@/lib/date-range";
import { StatCards } from "@/components/shared/stat-cards";
import { requirePermission } from "@/lib/auth/session";
import { getFinanceTotals, listExpenseEntries } from "@/lib/business/finance";
import { getExpense, listFinanceCategories } from "@/lib/data/finance";
import { refreshProcurementStatuses } from "@/lib/data/procurement";
import { today } from "@/lib/data/sales";
import { listPaymentAccounts } from "@/lib/data/settings";

export const metadata: Metadata = { title: "Expenses" };

export default async function ExpensesPage({ searchParams }: PageProps<"/finance/expenses">) {
  const auth = await requirePermission("FINANCE", "view");
  const raw = await searchParams;
  const todayDate = await today();
  await refreshProcurementStatuses();
  const range = resolveRange(raw, todayDate, "this-month");
  const type = raw.type === "supplier-payment" || raw.type === "general-expense" ? raw.type : undefined;
  const accountId = typeof raw.account === "string" ? raw.account : undefined;
  const categoryId = typeof raw.category === "string" ? raw.category : undefined;
  const entryId = typeof raw.entry === "string" ? raw.entry : undefined;

  const [entries, all, month, day, categories, accounts, activeEntry] = await Promise.all([
    listExpenseEntries(range, { type, accountId, categoryId }),
    getFinanceTotals({ from: null, to: null }),
    getFinanceTotals(presetRange("this-month", todayDate)),
    getFinanceTotals(presetRange("today", todayDate)),
    listFinanceCategories("EXPENSE"),
    listPaymentAccounts(),
    entryId ? getExpense(entryId) : null,
  ]);

  return (
    <div className="space-y-6">
      <StatCards
        stats={[
          { label: "Total expenses", value: all.totalExpenses, hint: "All time" },
          { label: "This month", value: month.totalExpenses },
          { label: "Today", value: day.totalExpenses },
        ]}
      />
      <EntriesTable
        kind="expense"
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
