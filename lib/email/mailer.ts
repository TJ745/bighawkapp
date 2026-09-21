import "server-only";
import nodemailer from "nodemailer";
import { BusinessError } from "@/lib/auth/errors";
import { getEmailTemplate } from "@/lib/data/settings";
import { getAppSettings, getCompanySettings, getEmailSettings } from "@/lib/data/settings";
import type { EmailTemplateKey } from "@/lib/generated/prisma/enums";
import { renderTemplate, type TemplateVars } from "./templates";

export type EmailAttachment = { filename: string; content: Buffer; contentType: string };

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
};

/**
 * SMTP comes from Settings → Email (Super Admin). Environment variables stay as a fallback so an
 * existing deployment keeps sending until someone fills the screen in.
 */
export async function getSmtpConfig(): Promise<SmtpConfig> {
  const row = await getEmailSettings();
  if (row.host && row.fromEmail) {
    return { ...row };
  }
  return {
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    username: process.env.SMTP_USER ?? "",
    password: process.env.SMTP_PASS ?? "",
    fromEmail: process.env.SMTP_FROM ?? "",
    fromName: "",
    replyTo: "",
  };
}

export function isSmtpUsable(config: SmtpConfig) {
  return Boolean(config.host && config.fromEmail);
}

export async function isEmailConfigured() {
  return isSmtpUsable(await getSmtpConfig());
}

function createTransport(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password } : undefined,
  });
}

/** "Company Name" <sender@example.com>, unless the address already carries its own name. */
async function fromAddress(config: SmtpConfig) {
  if (config.fromEmail.includes("<")) return config.fromEmail;
  const company = await getCompanySettings();
  const name = (config.fromName || company.companyName).trim();
  return name ? `"${name}" <${config.fromEmail}>` : config.fromEmail;
}

/** Sends a plain-text email using the SMTP settings from Settings → Email. */
export async function sendEmail(input: { to: string; subject: string; text: string; attachments?: EmailAttachment[] }) {
  const config = await getSmtpConfig();
  if (!isSmtpUsable(config)) {
    throw new BusinessError("Email is not configured. Ask your administrator to set up SMTP in Settings → Email.");
  }

  try {
    await createTransport(config).sendMail({
      from: await fromAddress(config),
      to: input.to,
      replyTo: config.replyTo || undefined,
      subject: input.subject,
      text: input.text,
      attachments: input.attachments,
    });
  } catch (error) {
    console.error("[email] send failed", error);
    throw new BusinessError("The email could not be sent. Please check the SMTP settings or try again later.");
  }
}

/**
 * Checks the server accepts the settings, without sending anything. Used by the Settings screen so
 * a wrong host or password is found there rather than when an invoice fails to reach a customer.
 */
export async function verifySmtp(config: SmtpConfig) {
  if (!isSmtpUsable(config)) throw new BusinessError("Enter at least an SMTP host and a From address.");
  try {
    await createTransport(config).verify();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    throw new BusinessError(`The mail server refused the connection.${detail ? ` ${detail}` : ""}`);
  }
}

/** Renders a Settings email template with variables (company name and signature are filled in automatically). */
export async function renderEmailTemplate(key: EmailTemplateKey, vars: TemplateVars) {
  const [template, company, settings] = await Promise.all([getEmailTemplate(key), getCompanySettings(), getAppSettings()]);
  const allVars: TemplateVars = {
    company_name: company.companyName,
    signature: settings.emailSignature,
    login_url: process.env.BETTER_AUTH_URL ? `${process.env.BETTER_AUTH_URL}/login` : "",
    ...vars,
  };
  return { subject: renderTemplate(template.subject, allVars), text: renderTemplate(template.body, allVars) };
}
