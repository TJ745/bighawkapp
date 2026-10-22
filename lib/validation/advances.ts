import { z } from "zod";

/**
 * Customer advances: money taken before there is an invoice to put it against.
 *
 * Field-level rules only. Whether an advance has enough left on it, whether the invoice belongs to
 * the same customer, whether anything has been applied already — those are the engine's sentences,
 * because no single field is at fault and "check the highlighted fields" would highlight nothing.
 */

const amount = (message = "Enter an amount") =>
  z.coerce.number({ error: message }).positive("Must be more than 0").max(99_999_999, "Too large");

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const takeAdvanceSchema = z.object({
  customerId: z.string().min(1, "Choose a customer"),
  amount: amount("Enter the amount received"),
  date: dateOnly,
  paymentAccountId: z.string().min(1, "Choose the account the money went into"),
  reference: optionalText(100),
  notes: optionalText(500),
});

export const applyAdvanceSchema = z.object({
  advanceId: z.string().min(1),
  invoiceId: z.string().min(1, "Choose an invoice"),
  amount: amount("Enter how much to apply"),
  date: dateOnly,
});

export const refundAdvanceSchema = z.object({
  advanceId: z.string().min(1),
  amount: amount("Enter how much to give back"),
  date: dateOnly,
  paymentAccountId: z.string().min(1, "Choose the account the money comes from"),
  reference: optionalText(100),
});

export const unapplyAdvanceSchema = z.object({ paymentId: z.string().min(1) });

export const cancelAdvanceSchema = z.object({
  advanceId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why it is being cancelled").max(300),
});

export const CUSTOMER_ADVANCE_STATUS = {
  OPEN: { label: "Open", tone: "info" },
  SETTLED: { label: "Settled", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;

export type TakeAdvanceInput = z.input<typeof takeAdvanceSchema>;
export type ApplyAdvanceInput = z.input<typeof applyAdvanceSchema>;
export type RefundAdvanceInput = z.input<typeof refundAdvanceSchema>;
