"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { EmptyState } from "@/components/shared/empty-state";
import { useUrlFilters } from "@/components/shared/use-url-filters";
import { useFormat } from "@/components/providers/format-provider";
import type { ProfitPoint } from "@/lib/business/dashboard";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

// Three series, fixed hues: money in (blue), money out (purple), profit (green, emphasised).
const config = {
  income: { label: "Income", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-6)" },
  profit: { label: "Profit", color: "var(--chart-2)" },
} satisfies ChartConfig;

// The toggle also picks the window: a month of days, or a year of months.
const GRANULARITIES = [
  { value: "daily", label: "30 days" },
  { value: "monthly", label: "12 months" },
];

type Props = { points: ProfitPoint[]; granularity: "daily" | "monthly" };

export function ProfitChart({ points, granularity }: Props) {
  const format = useFormat();
  const { set } = useUrlFilters();
  const hasData = points.some((p) => p.income !== 0 || p.expenses !== 0);

  return (
    <Card>
      <CardHeader className="flex-wrap gap-3">
        <div className="space-y-1">
          <CardTitle>Profit overview</CardTitle>
          <CardDescription>
            Money received, money paid out and what is left, {granularity === "daily" ? "per day over the last 30 days" : "per month over the last 12 months"}.
          </CardDescription>
        </div>
        <CardAction className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-4">
            {Object.entries(config).map(([key, item]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: item.color }} aria-hidden />
                {item.label}
              </span>
            ))}
          </div>
          {/* Segmented control, like the reference. */}
          <div className="flex rounded-lg bg-muted p-1" role="group" aria-label="Chart granularity">
            {GRANULARITIES.map((g) => (
              <button
                key={g.value}
                type="button"
                aria-pressed={granularity === g.value}
                onClick={() => set({ granularity: g.value === "monthly" ? null : g.value })}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  granularity === g.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState
            icon={TrendingUp}
            title={granularity === "daily" ? "No activity in the last 30 days" : "No activity in the last 12 months"}
            description="Record payments, income or expenses to see the trend."
            className="border-none"
          />
        ) : (
          <ChartContainer config={config} className="aspect-auto h-72 w-full">
            <ComposedChart data={points} margin={{ left: 4, right: 12, top: 8, bottom: 0 }} accessibilityLayer>
              <defs>
                <linearGradient id="fill-profit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="var(--color-profit)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} minTickGap={24} className="text-xs" />
              <YAxis tickLine={false} axisLine={false} width={68} tickMargin={4} className="text-xs" tickFormatter={(value: number) => format.integer(value)} />
              <ReferenceLine y={0} className="stroke-border" strokeWidth={1} />
              <ChartTooltip
                cursor={{ strokeDasharray: "4 4" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as ProfitPoint;
                  return (
                    <div className="grid min-w-48 gap-1.5 rounded-xl border bg-popover px-3 py-2.5 text-xs shadow-[var(--shadow-pop)]">
                      <p className="font-medium">{point.label}</p>
                      <Row color={config.income.color} label="Income" value={format.money(point.income)} />
                      <Row color={config.expenses.color} label="Expenses" value={format.money(point.expenses)} />
                      <div className="mt-1 border-t pt-1.5">
                        <Row color={config.profit.color} label="Profit" value={format.money(point.profit)} bold />
                      </div>
                    </div>
                  );
                }}
              />
              <Area dataKey="profit" type="monotone" stroke="none" fill="url(#fill-profit)" />
              <Line dataKey="income" type="monotone" stroke="var(--color-income)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, className: "stroke-card" }} />
              <Line dataKey="expenses" type="monotone" stroke="var(--color-expenses)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, className: "stroke-card" }} />
              <Line dataKey="profit" type="monotone" stroke="var(--color-profit)" strokeWidth={2.5} dot={false} activeDot={{ r: 5, strokeWidth: 2, className: "stroke-card" }} />
            </ComposedChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ color, label, value, bold }: { color: string; label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-6", bold && "font-medium")}>
      <span className="flex items-center gap-1.5">
        <span className="size-2 rounded-xs" style={{ background: color }} aria-hidden />
        <span className={bold ? undefined : "text-muted-foreground"}>{label}</span>
      </span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
