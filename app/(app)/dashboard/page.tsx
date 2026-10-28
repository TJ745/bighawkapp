import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
import { operatorContext } from "@/lib/data/companies";
import { refreshProcurementStatuses } from "@/lib/data/procurement";
import { refreshSalesStatuses, today } from "@/lib/data/sales";
import { presetRange, trailingRange } from "@/lib/date-range";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const auth = await requireAuth();

  /**
   * The operator's home is the list of customers, not a dashboard.
   *
   * They belong to no company, so until they pick one every figure here would be somebody's —
   * whichever the scope falls back to — presented as if it were theirs. They choose first, and
   * from then on this is that company's dashboard with the strip above saying whose.
   *
   * `operatorContext()` decides both this and that strip, so the two can never disagree. It
   * applies however many customers there are: one click is cheap, and "whose records am I
   * looking at" should not have an answer that depends on the size of the deployment.
   */
  if (auth.user.isSuperAdmin) {
    const operator = await operatorContext();
    if (operator && !operator.chosen) redirect("/settings/companies");
  }

  const raw = await searchParams;
  const todayDate = await today();
  const hasBusinessManagement = auth.hasModule("BUSINESS_MANAGEMENT");
  if (hasBusinessManagement) await Promise.all([refreshSalesStatuses(), refreshProcurementStatuses()]);

  // Figures cover this month; the chart shows a trailing trend so it is never a single point.
  const range = presetRange("this-month", todayDate);
  const granularity = raw.granularity === "daily" ? "daily" : "monthly";
  const chartRange = granularity === "daily" ? trailingRange(todayDate, "days", 30) : trailingRange(todayDate, "months", 12);

  const canSales = hasBusinessManagement && auth.can("SALES", "view");
  const canProcurement = hasBusinessManagement && auth.can("PROCUREMENT", "view");
  const canFinance = hasBusinessManagement && auth.can("FINANCE", "view");
  const canProjects = hasBusinessManagement && auth.can("PROJECTS", "view");
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
    ...(canSales && auth.can("SALES", "create")
      ? [
          {
            label: "New Sale",
            href: "/sales/invoices/new",
            icon: "sale" as const,
          },
        ]
      : []),
    ...(canFinance && auth.can("FINANCE", "create")
      ? [
          {
            label: "New Expense",
            href: "/finance/expenses?new=1",
            icon: "expense" as const,
          },
        ]
      : []),
    ...(hasBusinessManagement && auth.can("CUSTOMERS", "create")
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
          {hasBusinessManagement
            ? "You don't have access to the financial modules yet. Ask your administrator if you need them."
            : "Business Management is not enabled for your company. Ask your BigHawk administrator about it."}
        </p>
      )}
    </>
  );
}
