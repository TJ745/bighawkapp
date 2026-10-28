import { z } from "zod";
import { PosPaymentMethod } from "@/lib/generated/prisma/enums";

const money = (message = "Enter an amount") => z.coerce.number({ error: message }).min(0, "Cannot be negative").max(99_999_999, "Too large");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const cartLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999),
  /**
   * Only sent when the cashier typed a price. Left out, the server prices the line from the
   * catalogue and the customer's price list — a shown price is not a claim about what is owed.
   */
  unitPrice: money("Enter a price").optional(),
  discountPercent: z.coerce.number().min(0, "0–100").max(100, "0–100").default(0),
  /**
   * Chosen modifier options, by id. Must be declared here or Zod strips it and the sale is
   * recorded without the options the customer asked for.
   */
  modifierOptionIds: z.array(z.string().min(1)).max(20).default([]),
  /** The event these tickets admit to. The server decides whether there is room. */
  eventId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
  /** Ask for the customer's membership on this line. The server prices it. */
  useMembership: z.preprocess((v) => v === true || v === "true", z.boolean()).default(false),
  /** Who performed this service. Must be declared here or Zod strips it and nobody earns it. */
  staffId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const salePaymentSchema = z.object({
  method: z.enum(PosPaymentMethod),
  paymentAccountId: z.string().min(1, "Choose an account"),
  amount: money("Enter an amount").refine((v) => v > 0, "Must be more than 0"),
  reference: optionalText(100),
});

export const createSaleSchema = z.object({
  registerId: z.string().nullish().transform((v) => (v ? v : null)),
  customerId: z.string().nullish().transform((v) => (v ? v : null)),
  cartDiscountPercent: z.coerce.number().min(0, "0–100").max(100, "0–100").default(0),
  note: optionalText(500),
  lines: z.array(cartLineSchema).min(1, "Add at least one item"),
  payments: z.array(salePaymentSchema).default([]),
  park: z.boolean().default(false),
  /**
   * The till's own id for a sale rung up offline. Present only on a replay, and what makes
   * replaying safe to repeat — the server returns the sale it already made rather than a second one.
   */
  clientReference: z
    .string()
    .trim()
    .max(80)
    .nullish()
    .transform((v) => (v ? v : null)),
});

export const returnLineSchema = z.object({
  saleItemId: z.string().min(1),
  quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999),
});

export const createReturnSchema = z.object({
  saleId: z.string().min(1),
  registerId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
  lines: z.array(returnLineSchema).min(1, "Choose at least one item to return"),
  /** May be empty when the return comes to nothing — a membership visit, say. */
  refunds: z.array(salePaymentSchema).default([]),
  reason: z.string().trim().min(1, "Give a reason").max(300),
  restock: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

export const openShiftSchema = z.object({
  registerId: z.string().min(1, "Choose a register"),
  openingCash: money("Enter the opening cash").default(0),
});

export const closeShiftSchema = z.object({
  shiftId: z.string().min(1),
  countedCash: money("Enter the counted cash"),
  note: optionalText(500),
});

export const cashMovementSchema = z.object({
  shiftId: z.string().min(1),
  kind: z.enum(["CASH_IN", "CASH_OUT"]),
  amount: money("Enter an amount").refine((v) => v > 0, "Must be more than 0"),
  reason: z.string().trim().min(1, "Give a reason").max(200),
});

export const voidSaleSchema = z.object({
  saleId: z.string().min(1),
  reason: z.string().trim().min(1, "Give a reason").max(300),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Register name is required").max(100),
  cashAccountId: z.string().nullish().transform((v) => (v ? v : null)),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

export const PAYMENT_METHODS: { value: (typeof PosPaymentMethod)[keyof typeof PosPaymentMethod]; label: string; drawer: boolean }[] = [
  { value: "CASH", label: "Cash", drawer: true },
  { value: "CARD", label: "Card", drawer: false },
  { value: "TRANSFER", label: "Bank transfer", drawer: false },
  { value: "OTHER", label: "Other", drawer: false },
];

export const SALE_STATUS_LABELS = {
  PARKED: { label: "Held", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  VOIDED: { label: "Voided", tone: "neutral" },
  PARTIALLY_REFUNDED: { label: "Partly refunded", tone: "info" },
  REFUNDED: { label: "Refunded", tone: "danger" },
} as const;

export type CreateSaleInput = z.input<typeof createSaleSchema>;
export type SalePaymentInput = z.input<typeof salePaymentSchema>;
export type RegisterInput = z.input<typeof registerSchema>;
export type CreateReturnInput = z.input<typeof createReturnSchema>;
