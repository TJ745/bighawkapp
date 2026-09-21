"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { useUrlFilters } from "@/components/shared/use-url-filters";
import { useFormat } from "@/components/providers/format-provider";
import { markAllNotificationsRead, markNotificationRead } from "@/actions/notifications";
import type { NotificationRow } from "@/lib/data/notifications";
import { NOTIFICATION_TYPES } from "@/lib/settings/defaults";
import { cn } from "@/lib/utils";

type Props = { items: NotificationRow[]; total: number; page: number; unreadCount: number; today: string };

const ALL = "__all__";

function groupLabel(createdAt: Date, today: string) {
  const day = createdAt.toISOString().slice(0, 10);
  const [y, m, d] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  if (day === today) return "Today";
  if (day === yesterday) return "Yesterday";
  return "Earlier";
}

export function NotificationsList({ items, total, page, unreadCount, today }: Props) {
  const router = useRouter();
  const format = useFormat();
  const { get, set } = useUrlFilters();
  const [marking, setMarking] = useState(false);

  async function markAll() {
    setMarking(true);
    try {
      const result = await markAllNotificationsRead();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } finally {
      setMarking(false);
    }
  }

  async function toggle(n: NotificationRow) {
    const result = await markNotificationRead(n.id, !n.readAt);
    if (!result.success) toast.error(result.error);
    else router.refresh();
  }

  const groups: { label: string; items: NotificationRow[] }[] = [];
  for (const n of items) {
    const label = groupLabel(n.createdAt, today);
    const group = groups.find((g) => g.label === label);
    if (group) group.items.push(n);
    else groups.push({ label, items: [n] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={get("type") || ALL} onValueChange={(v) => set({ type: v === ALL ? null : v })}>
            <SelectTrigger className="w-56" aria-label="Type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              {NOTIFICATION_TYPES.map((t) => (
                <SelectItem key={t.type} value={t.type}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={get("unread") === "1" ? "unread" : "all"} onValueChange={(v) => set({ unread: v === "unread" ? "1" : null })}>
            <SelectTrigger className="w-36" aria-label="Read status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="unread">Unread</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {unreadCount > 0 ? (
          <Button variant="outline" onClick={markAll} disabled={marking}>
            {marking ? <Loader2 className="animate-spin" /> : <CheckCheck />}
            Mark all as read ({unreadCount})
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Bell} title="No notifications" description="Important events — overdue invoices, payments received, accepted quotations — appear here." />
      ) : (
        groups.map((group) => (
          <section key={group.label} className="space-y-2">
            <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h3>
            <ul className="divide-y rounded-lg border bg-card">
              {group.items.map((n) => {
                const meta = NOTIFICATION_TYPES.find((t) => t.type === n.type);
                const unread = !n.readAt;
                return (
                  <li key={n.id} className={cn("flex items-start gap-3 p-3 sm:p-4", unread && "bg-primary/5")}>
                    <span className={cn("mt-2 size-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")} aria-hidden />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {n.link ? (
                          <Link href={n.link} onClick={() => unread && markNotificationRead(n.id, true)} className={cn("text-sm hover:underline", unread ? "font-semibold" : "font-medium")}>
                            {n.title}
                          </Link>
                        ) : (
                          <span className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>{n.title}</span>
                        )}
                        <StatusBadge tone="neutral">{meta?.label ?? n.type}</StatusBadge>
                      </div>
                      <p className="text-sm text-muted-foreground">{n.message}</p>
                      <p className="text-xs text-muted-foreground">{format.dateTime(n.createdAt)}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={unread ? "Mark as read" : "Mark as unread"} title={unread ? "Mark as read" : "Mark as unread"} onClick={() => toggle(n)}>
                      <Check className={cn(unread ? "text-muted-foreground" : "text-success")} />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      <Pagination page={page} total={total} />
    </div>
  );
}
