import { z } from "zod";

/**
 * Supplier prepayments: money paid before there is a bill to put it against.
 *
 * Field-level rules only, as on the customer side. Whether a prepayment has enough left on it,
 * whether the purchase belongs to the same supplier, whether anything has been applied already —
 * those are the engine's sentences, because no single field is at fault and "check the highlighted
 * fields" would highlight nothing.
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

export const paySupplierAdvanceSchema = z.object({
  supplierId: z.string().min(1, "Choose a supplier"),
  amount: amount("Enter the amount paid"),
  date: dateOnly,
  paymentAccountId: z.string().min(1, "Choose the account the money came out of"),
  reference: optionalText(100),
  notes: optionalText(500),
});

export const applySupplierAdvanceSchema = z.object({
  advanceId: z.string().min(1),
  purchaseId: z.string().min(1, "Choose a purchase"),
  amount: amount("Enter how much to apply"),
  date: dateOnly,
});

export const refundSupplierAdvanceSchema = z.object({
  advanceId: z.string().min(1),
  amount: amount("Enter how much came back"),
  date: dateOnly,
  paymentAccountId: z.string().min(1, "Choose the account the money went into"),
  reference: optionalText(100),
});

export const unapplySupplierAdvanceSchema = z.object({ paymentId: z.string().min(1) });

export const cancelSupplierAdvanceSchema = z.object({
  advanceId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why it is being cancelled").max(300),
});

export const SUPPLIER_ADVANCE_STATUS = {
  OPEN: { label: "Open", tone: "info" },
  SETTLED: { label: "Settled", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;
