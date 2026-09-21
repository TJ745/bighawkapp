import { z } from "zod";
import { DocumentType, NotificationType, PaymentAccountType, PdfFont, PdfHeaderStyle, EmailTemplateKey } from "@/lib/generated/prisma/enums";
import { DATE_FORMATS, NUMBER_FORMATS, SESSION_TIMEOUT_OPTIONS } from "@/lib/settings/defaults";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max);

// Accepts "", "15", 15 → number (used for numeric inputs that arrive as strings).
const numberField = (min: number, max: number, message?: string) =>
  z.coerce.number({ error: message ?? "Enter a number" }).min(min, `Must be at least ${min}`).max(max, `Must be at most ${max}`);

const booleanField = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

const hexColor = z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1D4ED8");

export const companySettingsSchema = z.object({
  companyName: requiredText(150, "Company name is required"),
  crNumber: text(50),
  vatNumber: text(50),
  address: text(500),
  phone: text(50),
  email: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.email("Enter a valid email address").nullable()),
  website: text(200),
  nationalAddress: text(300),
  bankName: text(100),
  accountName: text(150),
  iban: text(50),
  accountNumber: text(50),
  description: text(1000),
  additionalContact: text(500),
});

export const documentNumberingSchema = z.object({
  sequences: z.array(
    z.object({
      type: z.enum(DocumentType),
      prefix: z
        .string()
        .trim()
        .min(1, "Prefix is required")
        .max(10, "Keep the prefix short")
        .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only")
        .transform((v) => v.toUpperCase()),
      startingNumber: numberField(1, 999999),
      includeYear: booleanField,
    }),
  ),
});

export const vatSettingsSchema = z.object({
  vatEnabled: booleanField,
  defaultVatRate: numberField(0, 100),
  allowVatChange: booleanField,
});

export const paymentTermsSettingsSchema = z.object({
  defaultPaymentTermDays: numberField(0, 365),
  defaultDepositPercent: numberField(0, 100),
  defaultRemainingDueDays: numberField(0, 365),
});

export const paymentAccountSchema = z.object({
  name: requiredText(100, "Account name is required"),
  type: z.enum(PaymentAccountType),
  openingBalance: numberField(-1_000_000_000, 1_000_000_000),
  notes: text(300),
});

export const notificationSettingsSchema = z.object({
  invoiceDueSoonDays: numberField(1, 60),
  items: z.array(
    z.object({
      type: z.enum(NotificationType),
      enabled: booleanField,
      inApp: booleanField,
      email: booleanField,
      recipientUserIds: z.array(z.string()).default([]),
    }),
  ),
});

export const regionalSettingsSchema = z.object({
  dateFormat: z.enum(DATE_FORMATS),
  timeZone: z.string().trim().min(1).max(64),
  numberFormat: z.enum(NUMBER_FORMATS),
});

export const stylingSettingsSchema = z.object({
  primaryColor: hexColor,
  secondaryColor: hexColor,
  pdfFont: z.enum(PdfFont),
  pdfHeaderStyle: z.enum(PdfHeaderStyle),
  pdfFooterText: z.string().trim().max(500).default(""),
  emailSignature: z.string().trim().max(1000).default(""),
  quotationTerms: z.string().trim().max(5000).default(""),
  invoiceTerms: z.string().trim().max(5000).default(""),
});

export const emailTemplatesSchema = z.object({
  templates: z.array(
    z.object({
      key: z.enum(EmailTemplateKey),
      subject: requiredText(200, "Subject is required"),
      body: requiredText(5000, "Body is required"),
    }),
  ),
});

// Outgoing email (SMTP). Host and From are what make email "configured"; the password is optional
// because many relays authenticate by IP, and an empty one means "keep the saved password".
export const emailSettingsSchema = z.object({
  host: z.string().trim().max(200).default(""),
  port: numberField(1, 65535, "Enter a port"),
  secure: booleanField,
  username: z.string().trim().max(200).default(""),
  password: z.string().max(200).default(""),
  clearPassword: booleanField.default(false),
  fromEmail: z
    .string()
    .trim()
    .max(200)
    .default("")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
  fromName: z.string().trim().max(150).default(""),
  replyTo: z
    .string()
    .trim()
    .max(200)
    .default("")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address"),
});

export const testEmailSchema = z.object({ to: z.email("Enter a valid email address").trim().toLowerCase() });

export const securitySettingsSchema = z.object({
  sessionTimeoutMinutes: z.coerce
    .number()
    .refine((v) => SESSION_TIMEOUT_OPTIONS.some((o) => o.value === v), "Choose a session timeout"),
  passwordMinLength: numberField(6, 64),
  passwordRequireNumber: booleanField,
  passwordRequireUppercase: booleanField,
  maxLoginAttempts: numberField(3, 20),
  lockoutMinutes: numberField(1, 1440),
});

export type CompanySettingsValues = z.output<typeof companySettingsSchema>;
export type PaymentAccountValues = z.output<typeof paymentAccountSchema>;
export type CompanySettingsInput = z.input<typeof companySettingsSchema>;
export type DocumentNumberingInput = z.input<typeof documentNumberingSchema>;
export type VatSettingsInput = z.input<typeof vatSettingsSchema>;
export type PaymentTermsSettingsInput = z.input<typeof paymentTermsSettingsSchema>;
export type PaymentAccountInput = z.input<typeof paymentAccountSchema>;
export type NotificationSettingsInput = z.input<typeof notificationSettingsSchema>;
export type RegionalSettingsInput = z.input<typeof regionalSettingsSchema>;
export type StylingSettingsInput = z.input<typeof stylingSettingsSchema>;
export type EmailTemplatesInput = z.input<typeof emailTemplatesSchema>;
export type SecuritySettingsInput = z.input<typeof securitySettingsSchema>;
export type EmailSettingsInput = z.input<typeof emailSettingsSchema>;
