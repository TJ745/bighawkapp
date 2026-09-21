import type {
  DocumentType,
  EmailTemplateKey,
  NotificationType,
  PaymentAccountType,
  PdfFont,
  PdfHeaderStyle,
} from "@/lib/generated/prisma/enums";

// Shared (client-safe) option lists and defaults for Settings.

export const DOCUMENT_TYPES: { type: DocumentType; label: string; prefix: string }[] = [
  { type: "QUOTATION", label: "Quotation", prefix: "QUO" },
  { type: "INVOICE", label: "Invoice", prefix: "INV" },
  { type: "PURCHASE", label: "Purchase", prefix: "PUR" },
  { type: "SUPPLIER_QUOTATION", label: "Supplier Quotation", prefix: "SQ" },
  { type: "EXPENSE", label: "Expense", prefix: "EXP" },
  { type: "INCOME", label: "Other Income", prefix: "INC" },
  { type: "PAYMENT", label: "Payment", prefix: "PAY" },
  { type: "PROJECT", label: "Project", prefix: "PROJ" },
];

export const PAYMENT_ACCOUNT_TYPES: { value: PaymentAccountType; label: string }[] = [
  { value: "COMPANY_BANK", label: "Company Bank" },
  { value: "CASH", label: "Cash" },
  { value: "OTHER_BANK", label: "Other Bank Account" },
];

export const DEFAULT_PAYMENT_ACCOUNTS: { name: string; type: PaymentAccountType }[] = [
  { name: "Company Bank", type: "COMPANY_BANK" },
  { name: "Cash", type: "CASH" },
  { name: "Other Bank Account", type: "OTHER_BANK" },
];

export const NOTIFICATION_TYPES: { type: NotificationType; label: string; description: string }[] = [
  { type: "INVOICE_OVERDUE", label: "Invoice overdue", description: "An invoice passed its due date with an unpaid balance." },
  { type: "INVOICE_DUE_SOON", label: "Invoice due soon", description: "An invoice is due within the next few days." },
  { type: "SUPPLIER_PAYMENT_DUE", label: "Supplier payment due", description: "A purchase is due or overdue for payment." },
  { type: "CUSTOMER_PAYMENT_RECEIVED", label: "Customer payment received", description: "A payment was recorded against an invoice." },
  { type: "QUOTATION_ACCEPTED", label: "Quotation accepted", description: "A quotation was marked as accepted." },
  { type: "NEW_USER_CREATED", label: "New user created", description: "A new user account was created." },
];

export const PAYMENT_TERM_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Due immediately" },
  { value: 7, label: "7 days" },
  { value: 15, label: "15 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
];

export const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD MMM YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const NUMBER_FORMATS = ["1,234.56", "1.234,56", "1 234,56"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

export const TIME_ZONES = [
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Qatar",
  "Asia/Muscat",
  "Africa/Cairo",
  "Asia/Amman",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Karachi",
  "Asia/Kolkata",
  "UTC",
];

export const PDF_FONTS: { value: PdfFont; label: string }[] = [
  { value: "HELVETICA", label: "Modern (Helvetica)" },
  { value: "TIMES", label: "Classic (Times)" },
  { value: "COURIER", label: "Typewriter (Courier)" },
];

export const PDF_HEADER_STYLES: { value: PdfHeaderStyle; label: string; description: string }[] = [
  { value: "STANDARD", label: "Standard", description: "Logo on the left, company details on the right." },
  { value: "CENTERED", label: "Centered", description: "Logo and company details centered." },
  { value: "MINIMAL", label: "Minimal", description: "Company name only, details in the footer." },
];

export const SESSION_TIMEOUT_OPTIONS: { value: number; label: string }[] = [
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 240, label: "4 hours" },
  { value: 480, label: "8 hours" },
  { value: 720, label: "12 hours" },
  { value: 1440, label: "24 hours" },
  { value: 10080, label: "7 days" },
];

// Placeholders available in email templates. Rendered by lib/email/templates.ts.
export const EMAIL_PLACEHOLDERS = [
  { key: "company_name", description: "Your company name" },
  { key: "recipient_name", description: "Customer / supplier / user name" },
  { key: "document_number", description: "Quotation, invoice or purchase number" },
  { key: "document_date", description: "Document date" },
  { key: "due_date", description: "Due date" },
  { key: "total", description: "Grand total" },
  { key: "remaining", description: "Remaining balance" },
  { key: "valid_until", description: "Quotation validity date" },
  { key: "login_url", description: "Link to the sign-in page" },
  { key: "signature", description: "Email signature from settings" },
] as const;

export const EMAIL_TEMPLATES: { key: EmailTemplateKey; label: string; description: string; subject: string; body: string }[] = [
  {
    key: "QUOTATION",
    label: "Quotation email",
    description: "Sent when a quotation is emailed to a customer (PDF attached).",
    subject: "Quotation {{document_number}} from {{company_name}}",
    body: `Dear {{recipient_name}},

Please find attached quotation {{document_number}} dated {{document_date}} for a total of {{total}}.

This quotation is valid until {{valid_until}}. Let us know if you have any questions.

{{signature}}`,
  },
  {
    key: "INVOICE",
    label: "Invoice email",
    description: "Sent when an invoice is emailed to a customer (PDF attached).",
    subject: "Invoice {{document_number}} from {{company_name}}",
    body: `Dear {{recipient_name}},

Please find attached invoice {{document_number}} dated {{document_date}} for a total of {{total}}.

Payment is due by {{due_date}}. Thank you for your business.

{{signature}}`,
  },
  {
    key: "PAYMENT_REMINDER",
    label: "Customer payment reminder",
    description: "Sent from Customer Receivables to remind a customer about an unpaid invoice.",
    subject: "Payment reminder: invoice {{document_number}}",
    body: `Dear {{recipient_name}},

This is a friendly reminder that invoice {{document_number}} has an outstanding balance of {{remaining}}, due on {{due_date}}.

Please arrange payment at your earliest convenience. If you have already paid, kindly disregard this message.

{{signature}}`,
  },
  {
    key: "SUPPLIER_PAYMENT_REMINDER",
    label: "Supplier payment notice",
    description: "Sent from Supplier Payables to a supplier about an upcoming payment.",
    subject: "Payment notice: purchase {{document_number}}",
    body: `Dear {{recipient_name}},

This is a notice regarding purchase {{document_number}} with a remaining balance of {{remaining}}, due on {{due_date}}.

Please contact us if any details need to be confirmed before payment.

{{signature}}`,
  },
  {
    key: "NEW_USER",
    label: "New user welcome",
    description: "Sent to a new user when their account is created.",
    subject: "Your {{company_name}} account",
    body: `Hello {{recipient_name}},

An account has been created for you. Sign in here: {{login_url}}

Your administrator will share your password with you separately.

{{signature}}`,
  },
];

export const DEFAULT_INCOME_CATEGORIES = ["Other Services", "Consulting", "Commission", "Refund Received", "Interest / Bank Income", "Miscellaneous"];

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Office Rent",
  "Utilities",
  "Internet",
  "Fuel",
  "Software & Subscriptions",
  "Office Supplies",
  "Travel",
  "Marketing",
  "Salaries / Contractors",
  "Bank Charges",
  "Miscellaneous",
];
