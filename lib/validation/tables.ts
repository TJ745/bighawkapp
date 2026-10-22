import { z } from "zod";
import { cartLineSchema, salePaymentSchema } from "./pos";

/** Table maintenance: the floor plan a manager sets up once. */
export const tableSchema = z.object({
  name: z.string().trim().min(1, "Table name is required").max(40),
  area: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => (v ? v : null)),
  seats: z.coerce.number({ error: "Enter the number of seats" }).int("Whole seats only").min(1, "At least 1").max(99, "At most 99"),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

const guestCount = z.coerce
  .number({ error: "Enter how many are seated" })
  .int("Whole people only")
  .min(1, "At least 1")
  .max(99, "At most 99")
  .nullish()
  .transform((v) => (v ? v : null));

const optionalId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null));

/**
 * Saving an open bill: the whole order, never a delta, so the server re-prices every line from the
 * catalogue. The first round carries `tableId` (dine-in) or `tabName` (a bar tab) and opens the
 * bill; later rounds carry `saleId` and replace what is on it.
 */
export const saveOrderSchema = z.object({
  saleId: optionalId,
  tableId: optionalId,
  customerId: optionalId,
  guestCount,
  note: z
    .string()
    .trim()
    .max(500)
    .nullish()
    .transform((v) => (v ? v : null)),
  tabName: z
    .string()
    .trim()
    .max(60)
    .nullish()
    .transform((v) => (v ? v : null)),
  lines: z.array(cartLineSchema).min(1, "Add at least one item"),
});

/** Taking payment on an open order; the amount comes from the stored order, not from the client. */
export const payOrderSchema = z.object({
  saleId: z.string().min(1),
  registerId: optionalId,
  payments: z.array(salePaymentSchema).min(1, "Say how the bill is being paid"),
});

export const transferOrderSchema = z.object({
  saleId: z.string().min(1),
  tableId: z.string().min(1, "Choose the table to move to"),
});

export const mergeOrdersSchema = z.object({
  sourceId: z.string().min(1, "Choose the order to merge"),
  targetId: z.string().min(1, "Choose the order to merge into"),
});

export const splitOrderSchema = z.object({
  saleId: z.string().min(1),
  lines: z
    .array(
      z.object({
        saleItemId: z.string().min(1),
        quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999),
      }),
    )
    .min(1, "Choose what moves to the second bill"),
});

export type TableInput = z.input<typeof tableSchema>;
export type SaveOrderInput = z.input<typeof saveOrderSchema>;
export type SplitOrderInput = z.input<typeof splitOrderSchema>;
