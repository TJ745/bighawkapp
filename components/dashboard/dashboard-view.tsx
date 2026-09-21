"use client";

import { AlertCircle, ArrowDownLeft, ArrowUpRight, FileText, Receipt, ShoppingCart, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatCards } from "@/components/shared/stat-cards";
import { INVOICE_STATUS } from "@/lib/business/sales-status";
import { PURCHASE_STATUS } from "@/lib/business/procurement-status";
import type { MoneyOverview, NeedsAttention, ProfitPoint, ProjectSummary, RecentActivity, TopCustomer } from "@/lib/business/dashboard";
import type { InvoiceStatus, PurchaseStatus } from "@/lib/generated/prisma/enums";
import { cn } from "@/lib/utils";
import { ActivityList, CardLink, SummaryCard, type ActivityRow, type SummaryRow } from "./attention-cards";
import { ProfitChart } from "./profit-chart";
import { ProjectsStrip, TopCustomersCard } from "./side-cards";

type Props = {
  overview: MoneyOverview;
  points: ProfitPoint[];
  granularity: "daily" | "monthly";
  attention: NeedsAttention;
  activity: RecentActivity;
  topCustomers: TopCustomer[] | null;
  projectSummary: ProjectSummary | null;
  can: {
    sales: boolean;
    procurement: boolean;
    finance: boolean;
    projects: boolean;
  };
};

export function DashboardView({ overview, points, granularity, attention, activity, topCustomers, projectSummary, can }: Props) {
  const sum = (values: number[]) => values.reduce((total, v) => total + v, 0);
  const label = overview.comparisonLabel ?? undefined;

  const attentionRows: SummaryRow[] = [
    ...(can.sales || can.finance
      ? [
          {
            id: "unpaid",
            href: can.finance ? "/finance/receivables" : "/sales/invoices?filter=overdue",
            icon: AlertCircle,
            tint: "red" as const,
            title: "Unpaid invoices",
            subtitle: `${attention.unpaidInvoices.length} ${attention.unpaidInvoices.length === 1 ? "invoice" : "invoices"} awaiting payment`,
            amount: sum(attention.unpaidInvoices.map((i) => i.remaining)),
            amountTone: "danger" as const,
          },
        ]
      : []),
    ...(can.procurement || can.finance
      ? [
          {
            id: "supplier",
            href: can.finance ? "/finance/payables" : "/procurement/purchases?filter=overdue",
            icon: ShoppingCart,
            tint: "amber" as const,
            title: "Supplier payments due",
            subtitle: `${attention.supplierDue.length} ${attention.supplierDue.length === 1 ? "purchase" : "purchases"} to pay`,
            amount: sum(attention.supplierDue.map((p) => p.remaining)),
          },
        ]
      : []),
    ...(can.sales || can.finance
      ? [
          {
            id: "received",
            href: can.finance ? "/finance/income" : "/sales/invoices?filter=paid",
            icon: ArrowDownLeft,
            tint: "green" as const,
            title: "Recent payments received",
            subtitle: `${attention.recentPayments.length} ${attention.recentPayments.length === 1 ? "payment" : "payments"} recorded`,
            amount: sum(attention.recentPayments.map((p) => p.amount)),
            amountTone: "success" as const,
          },
        ]
      : []),
  ];

  const invoiceRows: ActivityRow[] = activity.invoices.map((i) => ({
    id: i.id,
    href: `/sales/invoices/${i.id}`,
    icon: Receipt,
    title: i.number,
    subtitle: i.name,
    amount: i.total,
    date: i.date,
    badge: INVOICE_STATUS[i.status as InvoiceStatus],
  }));
  const purchaseRows: ActivityRow[] = activity.purchases.map((p) => ({
    id: p.id,
    href: `/procurement/purchases/${p.id}`,
    icon: ShoppingCart,
    title: p.number,
    subtitle: p.name,
    amount: p.total,
    date: p.date,
    badge: PURCHASE_STATUS[p.status as PurchaseStatus],
  }));
  const paymentRows: ActivityRow[] = [
    ...attention.recentPayments.map((p) => ({
      id: `in-${p.id}`,
      href: `/sales/invoices/${p.invoiceId}`,
      icon: ArrowDownLeft,
      title: p.name,
      subtitle: `Received · ${p.invoiceNumber}`,
      amount: p.amount,
      date: p.date,
    })),
    ...activity.supplierPayments.map((p) => ({
      id: `out-${p.id}`,
      href: `/procurement/purchases/${p.purchaseId}`,
      icon: ArrowUpRight,
      title: p.name,
      subtitle: `Paid · ${p.purchaseNumber}`,
      amount: p.amount,
      date: p.date,
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 6);

  const tabs = [
    ...(can.sales
      ? [
          {
            value: "sales",
            label: "Latest sales",
            rows: invoiceRows,
            empty: "No invoices yet.",
          },
        ]
      : []),
    ...(can.procurement
      ? [
          {
            value: "purchases",
            label: "Purchases",
            rows: purchaseRows,
            empty: "No purchases yet.",
          },
        ]
      : []),
    ...(can.sales || can.procurement || can.finance
      ? [
          {
            value: "payments",
            label: "Payments",
            rows: paymentRows,
            empty: "No payments recorded yet.",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <StatCards
        columns={4}
        stats={[
          {
            label: "Total Sales",
            value: overview.sales,
            icon: TrendingUp,
            tint: "blue",
            trend: overview.trend.sales,
            trendLabel: label,
            hint: "Invoiced this month",
          },
          {
            label: "Total Received",
            value: overview.received,
            icon: Wallet,
            tint: "green",
            trend: overview.trend.received,
            trendLabel: label,
            hint: "Money in",
          },
          {
            label: "Total Expenses",
            value: overview.expenses,
            icon: Receipt,
            tint: "red",
            trend: overview.trend.expenses,
            trendLabel: label,
            invertTrend: true,
            hint: "Money out",
          },
          {
            label: "Profit",
            value: overview.profit,
            icon: FileText,
            tint: "purple",
            trend: overview.trend.profit,
            trendLabel: label,
            tone: overview.profit >= 0 ? "default" : "danger",
          },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ProfitChart points={points} granularity={granularity} />
        <SummaryCard title="Needs attention" rows={attentionRows} emptyText="Nothing needs attention right now." />
      </div>

      {projectSummary ? <ProjectsStrip summary={projectSummary} /> : null}

      <div className={cn("grid gap-6", topCustomers ? "xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : undefined)}>
        {tabs.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              {can.sales ? <CardLink href="/sales/invoices" label="View all" /> : null}
            </CardHeader>
            <CardContent className="p-0">
              <Tabs defaultValue={tabs[0].value}>
                <TabsList className="mx-5 mb-1">
                  {tabs.map((t) => (
                    <TabsTrigger key={t.value} value={t.value}>
                      {t.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tabs.map((t) => (
                  <TabsContent key={t.value} value={t.value}>
                    <ActivityList rows={t.rows} emptyText={t.empty} />
                  </TabsContent>
                ))}
              </Tabs>
            </CardContent>
          </Card>
        ) : (
          <div />
        )}
        {topCustomers ? <TopCustomersCard customers={topCustomers} /> : null}
      </div>
    </div>
  );
}
