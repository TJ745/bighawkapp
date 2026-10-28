import { z } from "zod";

/**
 * Returning goods to a supplier.
 *
 * Field-level rules only. Whether a line has enough left to send back, whether the purchase has
 * been received at all, whether the refund is more than was ever paid — those are the engine's
 * sentences, because no single field is at fault and "check the highlighted fields" would
 * highlight nothing.
 */

const quantity = z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999, "Too large");

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const purchaseReturnLineSchema = z.object({
  purchaseItemId: z.string().min(1),
  quantity,
});

export const createPurchaseReturnSchema = z.object({
  purchaseId: z.string().min(1),
  branchId: z.string().min(1, "Choose the branch the goods are leaving from"),
  date: dateOnly,
  reason: z.string().trim().min(1, "Say why the goods are going back").max(300),
  internalNotes: optionalText(500),
  lines: z.array(purchaseReturnLineSchema).min(1, "Choose at least one line to send back"),
  /**
   * `z.null()` comes first on purpose: a coercing number schema turns `null` into `0`, which
   * would quietly record a refund of nothing instead of no refund at all.
   */
  refund: z.union([
    z.null(),
    z.object({
      amount: z.coerce.number({ error: "Enter the amount" }).positive("Must be more than 0").max(99_999_999, "Too large"),
      paymentAccountId: z.string().min(1, "Choose the account the money is coming into"),
      reference: optionalText(100),
    }),
  ]),
});

export const cancelPurchaseReturnSchema = z.object({
  returnId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why it is being cancelled").max(300),
});

export type CreatePurchaseReturnInput = z.input<typeof createPurchaseReturnSchema>;
