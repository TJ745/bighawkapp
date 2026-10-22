import { z } from "zod";

const money = (message = "Enter an amount") => z.coerce.number({ error: message }).min(0, "Cannot be negative").max(99_999_999, "Too large");

export const creditLineSchema = z.object({
  invoiceItemId: z.string().min(1),
  quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999),
});

/**
 * An adjustment credits an **amount** rather than goods.
 *
 * Not everything put right is a quantity: a goodwill discount agreed afterwards, a price corrected
 * after the fact, a delivery charge waived. Such a credit has no invoice line behind it, so nothing
 * caps it but the invoice's own total — and it carries its own VAT rate, because the VAT has to
 * reverse the way it was charged.
 *
 * The amount is **net**, exactly as an invoice line is typed, with VAT added on top. Reading it as
 * a gross figure would suit a shopkeeper's phrasing but would disagree with every other amount in
 * the app, and the screen shows the resulting total so there is nothing to guess.
 */
export const creditAdjustmentSchema = z.object({
  description: z.string().trim().min(1, "Say what the adjustment is for").max(300),
  amount: z.coerce.number({ error: "Enter an amount" }).positive("Must be more than 0").max(99_999_999),
  vatRate: z.coerce.number({ error: "Enter a VAT rate" }).min(0, "Cannot be negative").max(100, "Cannot be more than 100%"),
});

/**
 * Issuing a credit note. The refund is optional: without one the credit simply reduces what the
 * customer owes, which is the common case when the invoice has not been paid yet.
 */
export const createCreditNoteSchema = z.object({
  invoiceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
  reason: z.string().trim().min(1, "Say why it is being credited").max(300),
  internalNotes: z
    .string()
    .trim()
    .max(1000)
    .nullish()
    .transform((v) => (v ? v : null)),
  /**
   * Either list may be empty — but not both, and that is the engine's sentence to give, not a
   * field error, because no single field is at fault.
   */
  lines: z.array(creditLineSchema).default([]),
  adjustments: z.array(creditAdjustmentSchema).default([]),
  /** Money handed back now. `amount` 0 (or omitted) means the credit stays on the account. */
  refundAmount: z.preprocess((v) => (v === "" || v === null || v === undefined ? 0 : v), money("Enter the refund")).default(0),
  refundAccountId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
  refundReference: z
    .string()
    .trim()
    .max(100)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const cancelCreditNoteSchema = z.object({
  creditNoteId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why it is being cancelled").max(300),
});

export const CREDIT_NOTE_STATUS = {
  ISSUED: { label: "Issued", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;

export type CreateCreditNoteInput = z.input<typeof createCreditNoteSchema>;
