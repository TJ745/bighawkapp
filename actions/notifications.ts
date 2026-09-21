"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { authorizeSignedIn } from "@/lib/auth/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { countUnreadNotifications, listRecentNotifications, type RecentNotification } from "@/lib/data/notifications";

/** Feeds the header bell. Loaded when the dropdown opens so every page view does not pay for it. */
export async function recentNotifications(): Promise<ActionResult<{ items: RecentNotification[]; unreadCount: number }>> {
  return runAction(async () => {
    const auth = await authorizeSignedIn();
    const [items, unreadCount] = await Promise.all([listRecentNotifications(auth.user.id), countUnreadNotifications(auth.user.id)]);
    return { items, unreadCount };
  });
}

export async function markNotificationRead(id: string, read = true): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSignedIn();
    // Scoped to the signed-in user: nobody can touch someone else's notifications.
    await db.notification.updateMany({ where: { id, userId: auth.user.id }, data: { readAt: read ? new Date() : null } });
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
  });
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSignedIn();
    await db.notification.updateMany({ where: { userId: auth.user.id, readAt: null }, data: { readAt: new Date() } });
    revalidatePath("/notifications");
    revalidatePath("/", "layout");
  });
}
