"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { notificationMeta } from "@/components/notifications/notification-meta";
import { markAllNotificationsRead, markNotificationRead, recentNotifications } from "@/actions/notifications";
import type { RecentNotification } from "@/lib/data/notifications";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NotificationBell({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<RecentNotification[] | null>(null);
  const [marking, startMarking] = useTransition();
  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  // Loaded each time the dropdown opens, so it never shows a stale feed.
  useEffect(() => {
    if (!open) return;
    let active = true;
    void recentNotifications().then((result) => {
      if (!active) return;
      setItems(result.success ? result.data.items : []);
      if (!result.success) toast.error(result.error);
    });
    return () => {
      active = false;
    };
  }, [open]);

  function markAll() {
    startMarking(async () => {
      const result = await markAllNotificationsRead();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      const refreshed = await recentNotifications();
      if (refreshed.success) setItems(refreshed.data.items);
      router.refresh();
    });
  }

  function openNotification(item: RecentNotification) {
    setOpen(false);
    if (!item.readAt) {
      void markNotificationRead(item.id, true).then(() => router.refresh());
    }
    if (item.link) router.push(item.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} className="relative">
          <Bell className="size-[18px]" />
          {unreadCount > 0 ? (
            <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-[min(22rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-tint-red px-2 py-0.5 text-[11px] font-medium text-tint-red-foreground">{unreadCount} new</span>
            ) : null}
          </div>
          {unreadCount > 0 ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={markAll} disabled={marking}>
              {marking ? <Loader2 className="animate-spin" /> : <CheckCheck />}
              Mark all read
            </Button>
          ) : null}
        </div>
        <Separator />

        <div className="max-h-[22rem] overflow-y-auto">
          {items === null ? (
            <ul className="divide-y">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3 px-4 py-3">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="flex-1 space-y-2 py-0.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Bell className="size-5" />
              </span>
              <p className="text-sm font-medium">You&apos;re all caught up</p>
              <p className="text-xs text-muted-foreground">Overdue invoices, payments and accepted quotations show up here.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const meta = notificationMeta(item.type);
                const unread = !item.readAt;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(item)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                        unread && "bg-primary/[0.04]",
                      )}
                    >
                      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", meta.tileClassName)}>
                        <meta.icon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start gap-2">
                          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold" : "font-medium")}>{item.title}</span>
                          <span className="shrink-0 pt-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
                            {formatRelativeTime(item.createdAt)}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{item.message}</span>
                      </span>
                      {unread ? <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <Separator />
        <div className="p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link href="/notifications" onClick={() => setOpen(false)}>
              View all notifications
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
