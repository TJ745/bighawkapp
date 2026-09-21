import type { Metadata } from "next";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { PageHeader } from "@/components/shared/page-header";
import { requireAuth } from "@/lib/auth/session";
import { countUnreadNotifications, listNotifications, parseNotificationType } from "@/lib/data/notifications";
import { today } from "@/lib/data/sales";
import { parseListParams } from "@/lib/list-params";
import { runNotificationSweep } from "@/lib/notifications/sweep";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const auth = await requireAuth();
  const raw = await searchParams;
  const { page } = parseListParams(raw);
  // Opening the centre is a natural moment to catch up on time-based events.
  await runNotificationSweep();
  const [{ items, total }, unreadCount, todayDate] = await Promise.all([
    listNotifications(auth.user.id, { type: parseNotificationType(raw.type), unreadOnly: raw.unread === "1", page }),
    countUnreadNotifications(auth.user.id),
    today(),
  ]);
  return (
    <>
      <PageHeader title="Notifications" description="Important events that need your attention." />
      <NotificationsList items={items} total={total} page={page} unreadCount={unreadCount} today={todayDate} />
    </>
  );
}
