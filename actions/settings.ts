"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { resolveCompanyId } from "@/lib/db/tenant-scope";
import { BusinessError } from "@/lib/auth/errors";
import { authorize, authorizeSuperAdmin, type AuthContext } from "@/lib/auth/session";
import { recordAudit } from "@/lib/platform/audit";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { deleteStoredFile, fileFromFormData, IMAGE_TYPES, MAX_IMAGE_BYTES, storeFile } from "@/lib/storage";
import { getCompanySettings, getEmailSettings } from "@/lib/data/settings";
import { sellerProblems } from "@/lib/zatca/seller";
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
  zatcaSettingsSchema,
} from "@/lib/validation/settings";

/**
 * Which settings row to write. One row per company, so the key is the company itself rather
 * than the literal "default" the single-tenant app used — a primary key a second company could
 * never also have. `@@unique([companyId])` on each settings table is what makes this a key.
 */
async function settingsKey() {
  return { companyId: await resolveCompanyId() };
}
const LOGO_FOLDER = "branding";

function revalidateAll() {
  // Settings affect every screen (branding, formatting), so refresh the whole app tree.
  revalidatePath("/", "layout");
}

/**
 * Settings changes go in the audit trail by name.
 *
 * They are made rarely and they change how the whole app behaves — what a document is numbered,
 * what VAT is charged, how long a session lasts, where email goes. "Something in Settings
 * changed last Tuesday" is not an answer anybody can act on, so the section is recorded, and
 * where one field carries the weight on its own it is named too.
 */
async function auditSettings(auth: AuthContext, section: string, detail?: string) {
  await recordAudit({
    auth,
    action: "settings.updated",
    entity: "Settings",
    entityId: section,
    summary: `${section} settings updated${detail ? ` — ${detail}` : ""}`,
  });
}

export async function updateCompanySettings(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const raw = formDataToObject(formData);
    const input = parseInput(companySettingsSchema, raw);

    const current = await db.companySettings.findFirst({});
    const logo = fileFromFormData(formData, "logo");
    const removeLogo = raw.removeLogo === "true";
    const stored = logo ? await storeFile(logo, LOGO_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;

    await db.companySettings.upsert({
      where: await settingsKey(),
      update: { ...input, ...(stored ? { logoUrl: stored.url } : removeLogo ? { logoUrl: null } : {}) },
      create: { ...input, logoUrl: stored?.url ?? null },
    });

    if ((stored || removeLogo) && current?.logoUrl?.startsWith("/api/files/")) {
      await deleteStoredFile(current.logoUrl.slice("/api/files/".length));
    }
    await auditSettings(auth, "Company");
    revalidateAll();
  });
}

/**
 * Switching Saudi e-invoicing on or off.
 *
 * The seller details are checked **here**, not when a document prints: a QR code built from
 * half-filled settings scans perfectly and states the wrong thing, which is far worse than no QR
 * at all. So the mode cannot be turned on until the company's details are complete, and once it is
 * on every document can rely on them being there. Turning it off is always allowed.
 */
export async function updateZatcaSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const data = parseInput(zatcaSettingsSchema, input);

    if (data.mode !== "OFF") {
      const company = await getCompanySettings();
      const problems = sellerProblems(company);
      if (problems.length > 0) {
        throw new BusinessError(
          `Settings → Company is not complete enough to issue Saudi tax invoices. ${problems.join(" ")}`,
        );
      }
    }

    await db.zatcaSettings.upsert({
      where: await settingsKey(),
      update: { mode: data.mode },
      create: { mode: data.mode },
    });
    await auditSettings(auth, "E-invoicing", data.mode === "OFF" ? "switched off" : "Phase 1 switched on");
    revalidateAll();
  });
}

export async function updateDocumentNumbering(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const data = parseInput(documentNumberingSchema, input);

    const companyId = await resolveCompanyId();
    await db.$transaction(async (tx) => {
      for (const seq of data.sequences) {
        const existing = await tx.documentSequence.findFirst({ where: { type: seq.type } });
        // Never move the counter backwards below numbers already issued.
        const nextNumber = existing ? Math.max(existing.nextNumber, seq.startingNumber) : seq.startingNumber;
        await tx.documentSequence.upsert({
          where: { companyId_type: { companyId, type: seq.type } },
          update: { prefix: seq.prefix, startingNumber: seq.startingNumber, includeYear: seq.includeYear, nextNumber },
          create: { type: seq.type, prefix: seq.prefix, startingNumber: seq.startingNumber, includeYear: seq.includeYear, nextNumber },
        });
      }
    });
    await auditSettings(auth, "Document numbering");
    revalidatePath("/settings/numbering");
  });
}

export async function updateVatSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const data = parseInput(vatSettingsSchema, input);
    await db.appSettings.upsert({ where: await settingsKey(), update: data, create: { ...data } });
    await auditSettings(auth, "VAT");
    revalidateAll();
  });
}

export async function updatePaymentTermsSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const data = parseInput(paymentTermsSettingsSchema, input);
    await db.appSettings.upsert({ where: await settingsKey(), update: data, create: { ...data } });
    await auditSettings(auth, "Payment terms");
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
    const auth = await authorize("SETTINGS", "edit");
    const data = parseInput(notificationSettingsSchema, input);
    const companyId = await resolveCompanyId();
    await db.$transaction(async (tx) => {
      await tx.appSettings.upsert({
        where: await settingsKey(),
        update: { invoiceDueSoonDays: data.invoiceDueSoonDays },
        create: { invoiceDueSoonDays: data.invoiceDueSoonDays },
      });
      for (const item of data.items) {
        await tx.notificationSetting.upsert({
          where: { companyId_type: { companyId, type: item.type } },
          update: { enabled: item.enabled, inApp: item.inApp, email: item.email, recipientUserIds: item.recipientUserIds },
          create: { ...item },
        });
      }
    });
    await auditSettings(auth, "Notifications");
    revalidatePath("/settings/notifications");
  });
}

export async function updateRegionalSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const data = parseInput(regionalSettingsSchema, input);
    await db.appSettings.upsert({ where: await settingsKey(), update: data, create: { ...data } });
    await auditSettings(auth, "Date & regional");
    revalidateAll();
  });
}

export async function updateStylingSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const data = parseInput(stylingSettingsSchema, input);
    await db.appSettings.upsert({ where: await settingsKey(), update: data, create: { ...data } });
    await auditSettings(auth, "Document & email styling");
    revalidatePath("/settings/styling");
  });
}

export async function updateEmailTemplates(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const data = parseInput(emailTemplatesSchema, input);
    const companyId = await resolveCompanyId();
    await db.$transaction(
      data.templates.map((t) =>
        db.emailTemplate.upsert({
          where: { companyId_key: { companyId, key: t.key } },
          update: { subject: t.subject, body: t.body },
          create: t,
        }),
      ),
    );
    await auditSettings(auth, "Email templates");
    revalidatePath("/settings/styling");
  });
}

export async function updateSecuritySettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const data = parseInput(securitySettingsSchema, input);
    await db.appSettings.upsert({ where: await settingsKey(), update: data, create: { ...data } });
    await auditSettings(auth, "Security");
    revalidatePath("/settings/security");
  });
}

// --- Outgoing email (SMTP) — Super Admin only --------------------------------

export async function updateEmailSettings(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const { password, clearPassword, ...data } = parseInput(emailSettingsSchema, input);
    const current = await getEmailSettings();
    // A blank password keeps the saved one; clearing is explicit, so the field can stay write-only.
    const nextPassword = clearPassword ? "" : password || current.password;
    const row = { ...data, password: nextPassword };
    await db.emailSettings.upsert({ where: await settingsKey(), update: row, create: { ...row } });
    await auditSettings(auth, "Email (SMTP)");
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
