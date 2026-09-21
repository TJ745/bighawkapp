import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { QuickActions, type QuickAction } from "@/components/dashboard/quick-actions";
import { PageHeader } from "@/components/shared/page-header";
import { requireAuth } from "@/lib/auth/session";
import {
  getMoneyOverview,
  getNeedsAttention,
  getProfitSeries,
  getProjectSummary,
  getRecentActivity,
  getTopCustomers,
} from "@/lib/business/dashboard";
import { refreshProcurementStatuses } from "@/lib/data/procurement";
import { refreshSalesStatuses, today } from "@/lib/data/sales";
import { presetRange, trailingRange } from "@/lib/date-range";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const auth = await requireAuth();
  const raw = await searchParams;
  const todayDate = await today();
  await Promise.all([refreshSalesStatuses(), refreshProcurementStatuses()]);

  // Figures cover this month; the chart shows a trailing trend so it is never a single point.
  const range = presetRange("this-month", todayDate);
  const granularity = raw.granularity === "daily" ? "daily" : "monthly";
  const chartRange = granularity === "daily" ? trailingRange(todayDate, "days", 30) : trailingRange(todayDate, "months", 12);

  const canSales = auth.can("SALES", "view");
  const canProcurement = auth.can("PROCUREMENT", "view");
  const canFinance = auth.can("FINANCE", "view");
  const canProjects = auth.can("PROJECTS", "view");
  const canSeeMoney = canSales || canProcurement || canFinance;

  // Only fetch what the user may see — these lists are sent to the client.
  const [{ overview }, points, attention, activity] = await Promise.all([
    canSeeMoney
      ? getMoneyOverview(range, "vs. last month")
      : Promise.resolve({
          overview: {
            sales: 0,
            received: 0,
            expenses: 0,
            profit: 0,
            trend: {
              sales: null,
              received: null,
              expenses: null,
              profit: null,
            },
            comparisonLabel: null,
          },
        }),
    canSeeMoney ? getProfitSeries(chartRange, granularity, todayDate) : Promise.resolve([]),
    getNeedsAttention({
      sales: canSales || canFinance,
      procurement: canProcurement || canFinance,
    }),
    getRecentActivity({
      sales: canSales,
      procurement: canProcurement || canFinance,
    }),
  ]);
  const [topCustomers, projectSummary] = await Promise.all([
    canSales ? getTopCustomers(range) : Promise.resolve(null),
    canProjects ? getProjectSummary() : Promise.resolve(null),
  ]);

  const actions: QuickAction[] = [
    ...(auth.can("SALES", "create")
      ? [
          {
            label: "New Sale",
            href: "/sales/invoices/new",
            icon: "sale" as const,
          },
        ]
      : []),
    ...(auth.can("FINANCE", "create")
      ? [
          {
            label: "New Expense",
            href: "/finance/expenses?new=1",
            icon: "expense" as const,
          },
        ]
      : []),
    ...(auth.can("CUSTOMERS", "create")
      ? [
          {
            label: "New Customer",
            href: "/customers/new",
            icon: "customer" as const,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title={`Welcome back, ${auth.user.name.split(" ")[0]}`}
        description="Money in, money out and what needs your attention."
        actions={<QuickActions actions={actions} />}
      />
      {canSeeMoney ? (
        <DashboardView
          overview={overview}
          points={points}
          granularity={granularity}
          attention={attention}
          activity={activity}
          topCustomers={topCustomers}
          projectSummary={projectSummary}
          can={{
            sales: canSales,
            procurement: canProcurement,
            finance: canFinance,
            projects: canProjects,
          }}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          You don&apos;t have access to the financial modules yet. Ask your administrator if you need them.
        </p>
      )}
    </>
  );
}
