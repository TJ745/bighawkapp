import { z } from "zod";

export const receiveLineSchema = z.object({
  purchaseItemId: z.string().min(1),
  /** A line with no catalogue item is a cost, not stock, so it cannot be received. */
  variantId: z.string().min(1, "Choose the item this line buys"),
  quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999),
});

export const receiveGoodsSchema = z.object({
  purchaseId: z.string().min(1),
  branchId: z.string().min(1, "Choose the branch the goods arrived at"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date they arrived"),
  lines: z.array(receiveLineSchema).min(1, "Say what arrived"),
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
  /** Writes the received cost onto the item, so margin uses what was last actually paid. */
  updateCostPrice: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
});

export const cancelReceiptSchema = z.object({
  receiptId: z.string().min(1),
  reason: z.string().trim().min(1, "Say why it is being cancelled").max(300),
});

export const RECEIPT_STATUS = {
  ISSUED: { label: "Received", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
} as const;

export type ReceiveGoodsInput = z.input<typeof receiveGoodsSchema>;
