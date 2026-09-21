"use client";

import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import type { StatTint } from "@/components/shared/stat-cards";
import { cn } from "@/lib/utils";

const TILE: Record<StatTint, string> = {
  blue: "bg-tint-blue text-tint-blue-foreground",
  green: "bg-tint-green text-tint-green-foreground",
  amber: "bg-tint-amber text-tint-amber-foreground",
  red: "bg-tint-red text-tint-red-foreground",
  purple: "bg-tint-purple text-tint-purple-foreground",
  neutral: "bg-muted text-muted-foreground",
};

export type SummaryRow = {
  id: string;
  href: string;
  icon: LucideIcon;
  tint: StatTint;
  title: string;
  subtitle: string;
  amount: number;
  amountTone?: "default" | "success" | "danger";
};

/** "Needs attention": a few headline rows, each linking to the full list. */
export function SummaryCard({ title, rows, emptyText }: { title: string; rows: SummaryRow[]; emptyText: string }) {
  const format = useFormat();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 pb-1 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={row.href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60">
                  <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", TILE[row.tint])}>
                    <row.icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{row.subtitle}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      row.amountTone === "success" ? "text-success" : row.amountTone === "danger" ? "text-destructive" : "",
                    )}
                  >
                    {format.money(row.amount)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export type ActivityRow = {
  id: string;
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  amount: number;
  date: Date;
  badge?: { label: string; tone: StatusTone };
};

/** A list of documents/payments with amount, date and status — used inside the activity tabs. */
export function ActivityList({ rows, emptyText }: { rows: ActivityRow[]; emptyText: string }) {
  const format = useFormat();
  if (rows.length === 0) return <p className="px-5 py-6 text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ul className="divide-y">
      {rows.map((row) => (
        <li key={row.id}>
          <Link href={row.href} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/60">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <row.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{row.subtitle}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-medium tabular-nums">{format.money(row.amount)}</span>
              <span className="block text-xs text-muted-foreground">{format.date(row.date)}</span>
            </span>
            {row.badge ? <StatusBadge tone={row.badge.tone}>{row.badge.label}</StatusBadge> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <CardAction>
      <Button asChild variant="ghost" size="sm">
        <Link href={href}>
          {label}
          <ChevronRight />
        </Link>
      </Button>
    </CardAction>
  );
}
