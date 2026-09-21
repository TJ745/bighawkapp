"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize, authorizeSuperAdmin } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { deleteStoredFile, fileFromFormData, IMAGE_TYPES, MAX_IMAGE_BYTES, storeFile } from "@/lib/storage";
import { getCompanySettings, getEmailSettings } from "@/lib/data/settings";
import { getSmtpConfig, isSmtpUsable, sendEmail, verifySmtp } from "@/lib/email/mailer";
import {
  companySettingsSchema,
  emailSettingsSchema,
  testEmailSchema,
  documentNumberingSchema,
  emailTemplatesSchema,
  notificationSettingsSchema,
  paymentAccountSchema,
  paymentTermsSettingsSchema,
  regionalSettingsSchema,
  securitySettingsSchema,
  stylingSettingsSchema,
  vatSettingsSchema,
} from "@/lib/validation/settings";

const SINGLETON_ID = "default";
const LOGO_FOLDER = "branding";

function revalidateAll() {
  // Settings affect every screen (branding, formatting), so refresh the whole app tree.
  revalidatePath("/", "layout");
}

export async function updateCompanySettings(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const raw = formDataToObject(formData);
    const input = parseInput(companySettingsSchema, raw);

    const current = await db.companySettings.findUnique({ where: { id: SINGLETON_ID } });
    const logo = fileFromFormData(formData, "logo");
    const removeLogo = raw.removeLogo === "true";
    const stored = logo ? await storeFile(logo, LOGO_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;

    await db.companySettings.upsert({
      where: { id: SINGLETON_ID },
      update: { ...input, ...(stored ? { logoUrl: stored.url } : removeLogo ? { logoUrl: null } : {}) },
      create: { id: SINGLETON_ID, ...input, logoUrl: stored?.url ?? null },
    });

    if ((stored || removeLogo) && current?.logoUrl?.startsWith("/api/files/")) {
      await deleteStoredFile(current.logoUrl.slice("/api/files/".length));
    }
    revalidateAll();
  });
}

export async function updateDocumentNumbering(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const data = parseInput(documentNumberingSchema, input);

    await db.$transaction(async (tx) => {
      for (const seq of data.sequences) {
        const existing = await tx.documentSequence.findUnique({ where: { type: seq.type } });
        // Never move the counter backwards below numbers already issued.
        const nextNumber = existing ? Math.max(existing.nextNumber, seq.startingNumber) : seq.startingNumber;
        await tx.documentSequence.upsert({
          where: { type: seq.type },
          update: { prefix: seq.prefix, startingNumber: seq.startingNumber, includeYear: seq.includeYear, nextNumber },
          create: { type: seq.type, prefix: seq.prefix, startingNumber: seq.startingNumber, includeYear: seq.includeYear, nextNumber },
        });
      }
    });
    revalidatePath("/settings/numbering");
  });
}

export async function updateVatSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const data = parseInput(vatSettingsSchema, input);
    await db.appSettings.upsert({ where: { id: SINGLETON_ID }, update: data, create: { id: SINGLETON_ID, ...data } });
    revalidateAll();
  });
}

export async function updatePaymentTermsSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const data = parseInput(paymentTermsSettingsSchema, input);
    await db.appSettings.upsert({ where: { id: SINGLETON_ID }, update: data, create: { id: SINGLETON_ID, ...data } });
    revalidateAll();
  });
}

export async function createPaymentAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const data = parseInput(paymentAccountSchema, input);
    const account = await db.paymentAccount.create({ data });
    revalidateAll();
    return { id: account.id };
  });
}

export async function updatePaymentAccount(accountId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const data = parseInput(paymentAccountSchema, input);
    await db.paymentAccount.update({ where: { id: accountId }, data });
    revalidateAll();
  });
}

export async function setPaymentAccountActive(accountId: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    if (!isActive) {
      const activeCount = await db.paymentAccount.count({ where: { isActive: true, id: { not: accountId } } });
      if (activeCount === 0) throw new BusinessError("At least one payment account must stay active.");
    }
    await db.paymentAccount.update({ where: { id: accountId }, data: { isActive } });
    revalidateAll();
  });
}

export async function updateNotificationSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const data = parseInput(notificationSettingsSchema, input);
    await db.$transaction(async (tx) => {
      await tx.appSettings.upsert({
        where: { id: SINGLETON_ID },
        update: { invoiceDueSoonDays: data.invoiceDueSoonDays },
        create: { id: SINGLETON_ID, invoiceDueSoonDays: data.invoiceDueSoonDays },
      });
      for (const item of data.items) {
        await tx.notificationSetting.upsert({
          where: { type: item.type },
          update: { enabled: item.enabled, inApp: item.inApp, email: item.email, recipientUserIds: item.recipientUserIds },
          create: { ...item },
        });
      }
    });
    revalidatePath("/settings/notifications");
  });
}

export async function updateRegionalSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorize("SETTINGS", "edit");
    const data = parseInput(regionalSettingsSchema, input);
    await db.appSettings.upsert({ where: { id: SINGLETON_ID }, update: data, create: { id: SINGLETON_ID, ...data } });
    revalidateAll();
  });
}

export async function updateStylingSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();
    const data = parseInput(stylingSettingsSchema, input);
    await db.appSettings.upsert({ where: { id: SINGLETON_ID }, update: data, create: { id: SINGLETON_ID, ...data } });
    revalidatePath("/settings/styling");
  });
}

export async function updateEmailTemplates(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();
    const data = parseInput(emailTemplatesSchema, input);
    await db.$transaction(
      data.templates.map((t) =>
        db.emailTemplate.upsert({
          where: { key: t.key },
          update: { subject: t.subject, body: t.body },
          create: t,
        }),
      ),
    );
    revalidatePath("/settings/styling");
  });
}

export async function updateSecuritySettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();
    const data = parseInput(securitySettingsSchema, input);
    await db.appSettings.upsert({ where: { id: SINGLETON_ID }, update: data, create: { id: SINGLETON_ID, ...data } });
    revalidatePath("/settings/security");
  });
}

// --- Outgoing email (SMTP) — Super Admin only --------------------------------

export async function updateEmailSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();
    const { password, clearPassword, ...data } = parseInput(emailSettingsSchema, input);
    const current = await getEmailSettings();
    // A blank password keeps the saved one; clearing is explicit, so the field can stay write-only.
    const nextPassword = clearPassword ? "" : password || current.password;
    const row = { ...data, password: nextPassword };
    await db.emailSettings.upsert({ where: { id: SINGLETON_ID }, update: row, create: { id: SINGLETON_ID, ...row } });
    revalidatePath("/settings/email");
  });
}

/** Checks the mail server accepts the saved settings, without sending anything. */
export async function verifyEmailSettings(): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();
    await verifySmtp(await getSmtpConfig());
  });
}

/** Sends a short test message so the Super Admin can confirm delivery end to end. */
export async function sendTestEmail(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const { to } = parseInput(testEmailSchema, input);
    const config = await getSmtpConfig();
    if (!isSmtpUsable(config)) throw new BusinessError("Save an SMTP host and a From address first.");
    const company = await getCompanySettings();
    await sendEmail({
      to,
      subject: `Test email from ${company.companyName || "BigHawk"}`,
      text: [
        `This is a test message sent from Settings → Email by ${auth.user.name}.`,
        "",
        "If you received it, outgoing email is working.",
      ].join("\n"),
    });
  });
}
