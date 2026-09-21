import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { DocumentType, EmailTemplateKey } from "@/lib/generated/prisma/enums";
import {
  DEFAULT_PAYMENT_ACCOUNTS,
  DOCUMENT_TYPES,
  EMAIL_TEMPLATES,
  NOTIFICATION_TYPES,
  type DateFormat,
  type NumberFormat,
} from "@/lib/settings/defaults";
import type { RegionalSettings } from "@/lib/format";
import type { PasswordPolicy } from "@/lib/validation/users";

const SINGLETON_ID = "default";

// Reads a single-row settings table, creating the row with defaults on first access.
// Concurrent first requests may both try to create it; the loser simply re-reads.
async function readSingleton<T>(find: () => Promise<T | null>, create: () => Promise<T>): Promise<T> {
  const existing = await find();
  if (existing) return existing;
  try {
    return await create();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return (await find())!;
    }
    throw error;
  }
}

/** Company identity (Settings → Company). Creates the row on first access. */
export const getCompanySettings = cache(async () =>
  readSingleton(
    () => db.companySettings.findUnique({ where: { id: SINGLETON_ID } }),
    () => db.companySettings.create({ data: { id: SINGLETON_ID } }),
  ),
);

export type CompanySettings = Awaited<ReturnType<typeof getCompanySettings>>;

/** All other settings sections, with Decimals converted to numbers for client use. */
export const getAppSettings = cache(async () => {
  const row = await readSingleton(
    () => db.appSettings.findUnique({ where: { id: SINGLETON_ID } }),
    () => db.appSettings.create({ data: { id: SINGLETON_ID } }),
  );
  return {
    ...row,
    defaultVatRate: Number(row.defaultVatRate),
    defaultDepositPercent: Number(row.defaultDepositPercent),
  };
});

export type AppSettings = Awaited<ReturnType<typeof getAppSettings>>;

/**
 * Outgoing email settings, password included — server use only (the mailer). Never hand this row
 * to a client component; use getEmailSettingsView() for that.
 */
export const getEmailSettings = cache(async () =>
  readSingleton(
    () => db.emailSettings.findUnique({ where: { id: SINGLETON_ID } }),
    () => db.emailSettings.create({ data: { id: SINGLETON_ID } }),
  ),
);

/** The same settings for the Settings screen: the password is replaced by "is one saved?". */
export async function getEmailSettingsView() {
  const { password, ...rest } = await getEmailSettings();
  return { ...rest, hasPassword: password.length > 0 };
}

export type EmailSettingsView = Awaited<ReturnType<typeof getEmailSettingsView>>;

export const getPasswordPolicy = cache(async (): Promise<PasswordPolicy> => {
  const s = await getAppSettings();
  return {
    minLength: s.passwordMinLength,
    requireNumber: s.passwordRequireNumber,
    requireUppercase: s.passwordRequireUppercase,
  };
});

export const getRegionalSettings = cache(async (): Promise<RegionalSettings> => {
  const s = await getAppSettings();
  return {
    dateFormat: s.dateFormat as DateFormat,
    timeZone: s.timeZone,
    numberFormat: s.numberFormat as NumberFormat,
  };
});

/** Document numbering rows, one per document type (missing rows are created with defaults). */
export async function getDocumentSequences() {
  const existing = await db.documentSequence.findMany();
  const missing = DOCUMENT_TYPES.filter((d) => !existing.some((e) => e.type === d.type));
  if (missing.length) {
    await db.documentSequence.createMany({
      data: missing.map((d) => ({ type: d.type, prefix: d.prefix, startingNumber: 1, nextNumber: 1, includeYear: true })),
      skipDuplicates: true,
    });
    return db.documentSequence.findMany();
  }
  return existing;
}

export type DocumentSequenceRow = Awaited<ReturnType<typeof getDocumentSequences>>[number];

export function sequenceLabel(type: DocumentType) {
  return DOCUMENT_TYPES.find((d) => d.type === type)?.label ?? type;
}

/** Payment accounts; the three standard accounts are created if none exist yet. */
export async function listPaymentAccounts(options?: { activeOnly?: boolean }) {
  const count = await db.paymentAccount.count();
  if (count === 0) {
    await db.paymentAccount.createMany({ data: DEFAULT_PAYMENT_ACCOUNTS });
  }
  const rows = await db.paymentAccount.findMany({
    where: options?.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({ ...r, openingBalance: Number(r.openingBalance) }));
}

export type PaymentAccountRow = Awaited<ReturnType<typeof listPaymentAccounts>>[number];

export async function getNotificationSettings() {
  const existing = await db.notificationSetting.findMany();
  const missing = NOTIFICATION_TYPES.filter((n) => !existing.some((e) => e.type === n.type));
  if (missing.length) {
    await db.notificationSetting.createMany({
      data: missing.map((n) => ({ type: n.type })),
      skipDuplicates: true,
    });
    return db.notificationSetting.findMany();
  }
  return existing;
}

export type NotificationSettingRow = Awaited<ReturnType<typeof getNotificationSettings>>[number];

export async function getEmailTemplates() {
  const existing = await db.emailTemplate.findMany();
  const missing = EMAIL_TEMPLATES.filter((t) => !existing.some((e) => e.key === t.key));
  if (missing.length) {
    await db.emailTemplate.createMany({
      data: missing.map((t) => ({ key: t.key, subject: t.subject, body: t.body })),
      skipDuplicates: true,
    });
    return db.emailTemplate.findMany();
  }
  return existing;
}

export async function getEmailTemplate(key: EmailTemplateKey) {
  const templates = await getEmailTemplates();
  return templates.find((t) => t.key === key)!;
}

export type EmailTemplateRow = Awaited<ReturnType<typeof getEmailTemplates>>[number];
