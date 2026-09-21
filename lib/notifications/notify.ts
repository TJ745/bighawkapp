import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { NotificationType, PermissionModule } from "@/lib/generated/prisma/enums";
import { getNotificationSettings } from "@/lib/data/settings";
import { isEmailConfigured, sendEmail } from "@/lib/email/mailer";
import { getCompanySettings } from "@/lib/data/settings";

// Which module a notification belongs to; used to pick default recipients (everyone who can view it).
const MODULE_FOR_TYPE: Record<NotificationType, PermissionModule[]> = {
  INVOICE_OVERDUE: ["SALES", "FINANCE"],
  INVOICE_DUE_SOON: ["SALES", "FINANCE"],
  SUPPLIER_PAYMENT_DUE: ["PROCUREMENT", "FINANCE"],
  CUSTOMER_PAYMENT_RECEIVED: ["SALES", "FINANCE"],
  QUOTATION_ACCEPTED: ["SALES"],
  NEW_USER_CREATED: ["USERS"],
};

export type NotificationInput = {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  // When set, the event fires at most once (e.g. "invoice X overdue").
  dedupeKey?: string;
};

/** Active users allowed to see any of the modules (Super Admin always qualifies). */
async function usersForModules(modules: PermissionModule[]) {
  return db.user.findMany({
    where: {
      isActive: true,
      OR: [{ isSuperAdmin: true }, { role: { permissions: { some: { module: { in: modules }, canView: true } } } }],
    },
    select: { id: true, email: true, name: true },
  });
}

/**
 * Creates in-app notifications and/or emails according to Settings → Notifications.
 * Never throws: notification failures must not break the business action that triggered them.
 */
export async function notify(input: NotificationInput): Promise<void> {
  try {
    const settings = await getNotificationSettings();
    const setting = settings.find((s) => s.type === input.type);
    if (!setting?.enabled || (!setting.inApp && !setting.email)) return;

    if (input.dedupeKey) {
      try {
        await db.notificationEvent.create({ data: { key: input.dedupeKey } });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
        throw error;
      }
    }

    const recipients =
      setting.recipientUserIds.length > 0
        ? await db.user.findMany({ where: { id: { in: setting.recipientUserIds }, isActive: true }, select: { id: true, email: true, name: true } })
        : await usersForModules(MODULE_FOR_TYPE[input.type]);
    if (recipients.length === 0) return;

    if (setting.inApp) {
      await db.notification.createMany({
        data: recipients.map((r) => ({ userId: r.id, type: input.type, title: input.title, message: input.message, link: input.link ?? null })),
      });
    }

    if (setting.email && (await isEmailConfigured())) {
      const company = await getCompanySettings();
      const base = process.env.BETTER_AUTH_URL ?? "";
      const text = `${input.message}${input.link ? `\n\n${base}${input.link}` : ""}\n\n— ${company.companyName || "BigHawk"}`;
      await Promise.allSettled(recipients.filter((r) => r.email).map((r) => sendEmail({ to: r.email, subject: input.title, text })));
    }
  } catch (error) {
    console.error("[notify] failed", error);
  }
}
