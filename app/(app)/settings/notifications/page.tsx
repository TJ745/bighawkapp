import type { Metadata } from "next";
import { NotificationsForm } from "@/components/settings/notifications-form";
import { requirePermission } from "@/lib/auth/session";
import { getAppSettings, getNotificationSettings } from "@/lib/data/settings";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Notification Settings" };

export default async function NotificationSettingsPage() {
  const auth = await requirePermission("SETTINGS", "view");
  const [settings, items, users] = await Promise.all([
    getAppSettings(),
    getNotificationSettings(),
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  return <NotificationsForm settings={settings} items={items} users={users} canEdit={auth.can("SETTINGS", "edit")} />;
}
