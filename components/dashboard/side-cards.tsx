"use client";

import Link from "next/link";
import { CheckCircle2, FolderKanban, PauseCircle, PlayCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFormat } from "@/components/providers/format-provider";
import type { ProjectSummary, TopCustomer } from "@/lib/business/dashboard";
import { getInitials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CardLink } from "./attention-cards";

// Avatar tints cycle by position so the list stays readable without inventing per-customer colours.
const AVATAR_TINTS = [
  "bg-tint-blue text-tint-blue-foreground",
  "bg-tint-green text-tint-green-foreground",
  "bg-tint-purple text-tint-purple-foreground",
  "bg-tint-amber text-tint-amber-foreground",
  "bg-tint-red text-tint-red-foreground",
];

export function TopCustomersCard({ customers }: { customers: TopCustomer[] }) {
  const format = useFormat();
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top customers</CardTitle>
        <CardLink href="/customers" label="View all" />
      </CardHeader>
      <CardContent className="p-0">
        {customers.length === 0 ? (
          <p className="px-5 pb-1 text-sm text-muted-foreground">No invoiced customers this month.</p>
        ) : (
          <ul>
            {customers.map((customer, index) => (
              <li key={customer.id}>
                <Link href={`/customers/${customer.id}`} className="flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/60">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      AVATAR_TINTS[index % AVATAR_TINTS.length],
                    )}
                  >
                    {getInitials(customer.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{customer.name}</span>
                  <span className="shrink-0 text-sm font-medium tabular-nums">{format.money(customer.total)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const TILES = [
  {
    key: "total",
    label: "Total projects",
    href: "/projects",
    icon: FolderKanban,
    tint: "bg-tint-blue text-tint-blue-foreground",
  },
  {
    key: "inProgress",
    label: "In progress",
    href: "/projects?filter=in-progress",
    icon: PlayCircle,
    tint: "bg-tint-amber text-tint-amber-foreground",
  },
  {
    key: "completed",
    label: "Completed",
    href: "/projects?filter=completed",
    icon: CheckCircle2,
    tint: "bg-tint-green text-tint-green-foreground",
  },
  {
    key: "onHold",
    label: "On hold",
    href: "/projects?filter=on-hold",
    icon: PauseCircle,
    tint: "bg-tint-purple text-tint-purple-foreground",
  },
] as const;

/** Full-width strip: project counts need room to breathe, not three boxes in a narrow column. */
export function ProjectsStrip({ summary }: { summary: ProjectSummary }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projects</CardTitle>
        <CardLink href="/projects" label="View all" />
      </CardHeader>
      <CardContent className="p-0">
        {/* gap-px over a border-coloured grid draws clean dividers at any column count. */}
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {TILES.map((tile) => (
            <Link key={tile.key} href={tile.href} className="flex items-center gap-3.5 bg-card px-5 py-4 transition-colors hover:bg-muted/50">
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tile.tint)}>
                <tile.icon className="size-5" />
              </span>
              <span className="grid min-w-0">
                <span className="text-2xl leading-none font-semibold tabular-nums">{summary[tile.key]}</span>
                <span className="mt-1.5 truncate text-xs text-muted-foreground">{tile.label}</span>
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
