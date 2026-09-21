"use client";

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useFormat } from "@/components/providers/format-provider";
import { cn } from "@/lib/utils";

export type StatTint = "blue" | "green" | "amber" | "red" | "purple" | "neutral";

export type Stat = {
  label: string;
  value: number;
  hint?: string;
  icon?: LucideIcon;
  tint?: StatTint;
  /** Percentage change against the previous period; a positive number is not always good (see `invertTrend`). */
  trend?: number | null;
  trendLabel?: string;
  invertTrend?: boolean;
  tone?: "success" | "warning" | "danger" | "default";
};

const TILE: Record<StatTint, string> = {
  blue: "bg-tint-blue text-tint-blue-foreground",
  green: "bg-tint-green text-tint-green-foreground",
  amber: "bg-tint-amber text-tint-amber-foreground",
  red: "bg-tint-red text-tint-red-foreground",
  purple: "bg-tint-purple text-tint-purple-foreground",
  neutral: "bg-muted text-muted-foreground",
};

const VALUE_TONE = {
  default: "",
  success: "text-success",
  warning: "text-warning-foreground dark:text-warning",
  danger: "text-destructive",
};

// Row of money summary cards: icon tile, label, value and an optional period-over-period trend.
export function StatCards({ stats, columns = 3 }: { stats: Stat[]; columns?: 2 | 3 | 4 }) {
  const format = useFormat();
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", columns === 3 ? "lg:grid-cols-3" : columns === 4 ? "xl:grid-cols-4" : "")}>
      {stats.map((s) => {
        const Icon = s.icon;
        const up = (s.trend ?? 0) >= 0;
        const good = s.invertTrend ? !up : up;
        return (
          <Card key={s.label} size="sm">
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                {Icon ? (
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TILE[s.tint ?? "neutral"])}>
                    <Icon className="size-5" />
                  </span>
                ) : null}
                <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
              </div>
              <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", VALUE_TONE[s.tone ?? "default"])}>{format.money(s.value)}</p>
              {s.trend !== null && s.trend !== undefined ? (
                <p className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className={cn("inline-flex items-center gap-0.5 font-medium", good ? "text-success" : "text-destructive")}>
                    {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
                    {Math.abs(s.trend).toFixed(0)}%
                  </span>
                  <span className="text-muted-foreground">{s.trendLabel ?? "vs. previous period"}</span>
                </p>
              ) : s.hint ? (
                <p className="text-xs text-muted-foreground">{s.hint}</p>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
