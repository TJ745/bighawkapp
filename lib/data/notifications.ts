import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { NotificationType } from "@/lib/generated/prisma/enums";
import { paginate } from "@/lib/list-params";

export type NotificationFilters = { type?: NotificationType; unreadOnly?: boolean; page: number };

export function parseNotificationType(value: unknown): NotificationType | undefined {
  return typeof value === "string" && (Object.values(NotificationType) as string[]).includes(value) ? (value as NotificationType) : undefined;
}

export async function listNotifications(userId: string, filters: NotificationFilters) {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.unreadOnly ? { readAt: null } : {}),
  };
  const [items, total] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(filters.page) }),
    db.notification.count({ where }),
  ]);
  return { items, total };
}

export type NotificationRow = Awaited<ReturnType<typeof listNotifications>>["items"][number];

/** The short list behind the header bell — newest first, read and unread together. */
export async function listRecentNotifications(userId: string, limit = 8) {
  return db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, title: true, message: true, link: true, readAt: true, createdAt: true },
  });
}

export type RecentNotification = Awaited<ReturnType<typeof listRecentNotifications>>[number];

export async function countUnreadNotifications(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}
