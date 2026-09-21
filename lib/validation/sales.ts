import { z } from "zod";
import { isDateOnly } from "@/lib/dates";

export const dateOnlySchema = z.string().refine(isDateOnly, "Enter a valid date");

// nullish(), not optional(): these schemas are re-parsed on the server against their own output,
// where an empty field has already become null. See toPayload() in components/documents/document-form.tsx.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const lineItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(500),
  quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Quantity must be more than 0").max(1_000_000),
  unitPrice: z.coerce.number({ error: "Enter a price" }).min(0, "Price cannot be negative").max(1_000_000_000),
  discountPercent: z.coerce.number({ error: "Enter a discount" }).min(0, "0–100").max(100, "0–100").default(0),
  vatRate: z.coerce.number({ error: "Enter a VAT rate" }).min(0, "0–100").max(100, "0–100").default(0),
});

const documentBase = {
  customerId: z.string().min(1, "Choose a customer"),
  projectId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
  date: dateOnlySchema,
  terms: optionalText(5000),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
};

export const quotationSchema = z.object({
  ...documentBase,
  validUntil: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(dateOnlySchema.nullable()),
});

export const invoiceSchema = z.object({
  ...documentBase,
  paymentTermDays: z.coerce.number().int().min(0).max(365),
  dueDate: dateOnlySchema,
  depositPercent: z.coerce.number().min(0, "0–100").max(100, "0–100").default(0),
  internalNotes: optionalText(5000),
});

export const invoicePaymentSchema = z.object({
  amount: z.coerce.number({ error: "Enter an amount" }).positive("Amount must be more than 0").max(1_000_000_000),
  date: dateOnlySchema,
  paymentAccountId: z.string().min(1, "Choose an account"),
  reference: optionalText(200),
  notes: optionalText(1000),
});

export const sendDocumentSchema = z.object({
  to: z.email("Enter a valid email address").trim().toLowerCase(),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Message is required").max(10000),
});

export type LineItemInput = z.input<typeof lineItemSchema>;
export type QuotationFormValues = z.input<typeof quotationSchema>;
export type QuotationValues = z.output<typeof quotationSchema>;
export type InvoiceFormValues = z.input<typeof invoiceSchema>;
export type InvoiceValues = z.output<typeof invoiceSchema>;
export type InvoicePaymentFormValues = z.input<typeof invoicePaymentSchema>;
export type InvoicePaymentValues = z.output<typeof invoicePaymentSchema>;
export type SendDocumentFormValues = z.input<typeof sendDocumentSchema>;
export type SendDocumentValues = z.output<typeof sendDocumentSchema>;
