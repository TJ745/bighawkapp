import { z } from "zod";
import { ItemKind, StockMovementKind } from "@/lib/generated/prisma/enums";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const money = (message = "Enter an amount") =>
  z.coerce.number({ error: message }).min(0, "Cannot be negative").max(99_999_999, "Too large");

const quantity = (message = "Enter a quantity") =>
  z.coerce.number({ error: message }).min(0, "Cannot be negative").max(9_999_999, "Too large");

export const UNIT_OPTIONS = ["pcs", "kg", "g", "L", "ml", "m", "box", "pack", "hour", "session", "day"] as const;

export const itemCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(100),
  description: optionalText(300),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

/**
 * One variant row. A product sold in a single form still has one (the default), so stock and
 * barcodes always live in the same place.
 */
export const itemVariantSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Variant name is required").max(150),
  sku: optionalText(60),
  barcode: optionalText(60),
  /// Short numeric code for scales and keypads.
  plu: z
    .string()
    .trim()
    .max(8)
    .regex(/^\d*$/, "A PLU is digits only")
    .nullish()
    .transform((v) => (v ? v : null)),
  attributes: z.record(z.string(), z.string()).nullish(),
  // Blank inherits the item price/cost, which is why these are nullable rather than 0.
  salePrice: z
    .union([z.literal(""), money("Enter a price")])
    .nullish()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v))),
  costPrice: z
    .union([z.literal(""), money("Enter a cost")])
    .nullish()
    .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v))),
  minStock: quantity().default(0),
  reorderLevel: quantity().default(0),
  isActive: z.boolean().default(true),
});

export const itemSchema = z
  .object({
    kind: z.enum(ItemKind).default("PRODUCT"),
    name: z.string().trim().min(1, "Name is required").max(200),
    code: optionalText(60),
    categoryId: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
    brand: optionalText(100),
    description: optionalText(1000),
    unit: z.string().trim().min(1, "Unit is required").max(20).default("pcs"),
    salePrice: money("Enter a selling price").default(0),
    costPrice: money("Enter a cost price").default(0),
    vatRate: z
      .union([z.literal(""), z.coerce.number().min(0, "0–100").max(100, "0–100")])
      .nullish()
      .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v))),
    trackStock: z.boolean().default(true),
    durationMinutes: z
      .union([z.literal(""), z.coerce.number().int().min(1, "At least 1 minute").max(10_000)])
      .nullish()
      .transform((v) => (v === "" || v === null || v === undefined ? null : Number(v))),
    isActive: z.boolean().default(true),
    variants: z.array(itemVariantSchema).min(1, "At least one variant is required"),
  })
  .superRefine((value, ctx) => {
    // A service is time and labour, never stock.
    if (value.kind === "SERVICE" && value.trackStock) {
      ctx.addIssue({ code: "custom", path: ["trackStock"], message: "Services do not carry stock." });
    }
    const skus = value.variants.map((v) => v.sku).filter(Boolean);
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Each variant needs its own SKU." });
    }
    const barcodes = value.variants.map((v) => v.barcode).filter(Boolean);
    if (new Set(barcodes).size !== barcodes.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Each variant needs its own barcode." });
    }
    const plus = value.variants.map((v) => v.plu).filter(Boolean);
    if (new Set(plus).size !== plus.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "Each variant needs its own PLU." });
    }
  });

/** Manual stock change: either a counted total or a delta in or out. */
export const stockAdjustmentSchema = z
  .object({
    variantId: z.string().min(1, "Choose a product"),
    branchId: z.string().min(1, "Choose a branch"),
    mode: z.enum(["count", "delta"]).default("count"),
    countedQuantity: quantity().optional(),
    delta: z.coerce.number({ error: "Enter a quantity" }).min(-9_999_999).max(9_999_999).optional(),
    kind: z.enum(StockMovementKind).optional(),
    note: optionalText(300),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "count" && value.countedQuantity === undefined) {
      ctx.addIssue({ code: "custom", path: ["countedQuantity"], message: "Enter the counted quantity" });
    }
    if (value.mode === "delta" && (value.delta === undefined || value.delta === 0)) {
      ctx.addIssue({ code: "custom", path: ["delta"], message: "Enter a quantity to add or remove" });
    }
  });

export const stockTransferSchema = z.object({
  variantId: z.string().min(1, "Choose a product"),
  fromBranchId: z.string().min(1, "Choose the branch sending stock"),
  toBranchId: z.string().min(1, "Choose the branch receiving stock"),
  quantity: z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999),
  note: optionalText(300),
});

export const ITEM_KINDS: { value: (typeof ItemKind)[keyof typeof ItemKind]; label: string; description: string }[] = [
  { value: "PRODUCT", label: "Product", description: "Something you stock and sell." },
  { value: "SERVICE", label: "Service", description: "Work you perform — no stock." },
];

export const MOVEMENT_LABELS: Record<(typeof StockMovementKind)[keyof typeof StockMovementKind], string> = {
  OPENING: "Opening stock",
  PURCHASE_RECEIPT: "Purchase received",
  SALE: "Sold",
  SALE_RETURN: "Customer return",
  PURCHASE_RETURN: "Returned to supplier",
  ADJUSTMENT: "Adjustment",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  RENTAL_OUT: "Out on rental",
  RENTAL_IN: "Back from rental",
};

export type ItemCategoryInput = z.input<typeof itemCategorySchema>;
export type ItemFormValues = z.input<typeof itemSchema>;
export type ItemValues = z.output<typeof itemSchema>;
export type ItemVariantInput = z.input<typeof itemVariantSchema>;
export type StockAdjustmentInput = z.input<typeof stockAdjustmentSchema>;
export type StockTransferInput = z.input<typeof stockTransferSchema>;
