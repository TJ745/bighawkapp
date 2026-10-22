import { z } from "zod";

const money = (message = "Enter an amount") => z.coerce.number({ error: message }).min(0, "Cannot be negative").max(99_999_999, "Too large");

export const priceListSchema = z.object({
  name: z.string().trim().min(1, "Give the list a name").max(60),
  description: z
    .string()
    .trim()
    .max(300)
    .nullish()
    .transform((v) => (v ? v : null)),
  isDefault: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

/**
 * One item's pricing on one list. A blank price with no discount and no breaks removes the entry,
 * which is how an item goes back to the catalogue price.
 */
export const priceEntrySchema = z.object({
  listId: z.string().min(1),
  variantId: z.string().min(1, "Choose a product"),
  /**
   * Blank means "no fixed price here": the discount, the breaks, or the catalogue decide.
   *
   * `z.null()` has to come first in the union: a coercing number schema turns null into 0, which
   * would quietly price the item at nothing instead of leaving it to the discount.
   */
  price: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.union([z.null(), money("Enter a price")])),
  discountPercent: z.coerce.number({ error: "Enter a percentage" }).min(0, "0–100").max(100, "0–100").default(0),
  tiers: z
    .array(
      z.object({
        minQuantity: z.coerce.number({ error: "Enter a quantity" }).positive("Must be more than 0").max(9_999_999),
        price: money("Enter a price"),
      }),
    )
    .max(10, "Ten quantity breaks is plenty")
    .default([]),
});

export const setCustomerListSchema = z.object({
  customerId: z.string().min(1),
  listId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
});

/** What the till asks for, to show the customer's prices before anything is rung up. */
export const quotePricesSchema = z.object({
  customerId: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null)),
  lines: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.coerce.number().positive().max(9_999_999),
      }),
    )
    .max(200),
});

export type PriceListInput = z.input<typeof priceListSchema>;
export type PriceEntryInput = z.input<typeof priceEntrySchema>;
