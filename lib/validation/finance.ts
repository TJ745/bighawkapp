import { z } from "zod";
import { dateOnlySchema } from "./sales";

// Shared by Other Income and General Expense entries.
export const financeEntrySchema = z.object({
  categoryId: z.string().min(1, "Choose a category"),
  amount: z.coerce.number({ error: "Enter an amount" }).positive("Amount must be more than 0").max(1_000_000_000),
  date: dateOnlySchema,
  paymentAccountId: z.string().min(1, "Choose an account"),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * An expense, which may carry VAT the business can reclaim.
 *
 * Only expenses, not income: money the business receives is invoiced through Sales, where VAT is
 * already handled properly. `amount` stays what was **paid** — VAT included — so the rate only
 * says how much of that figure was tax.
 */
export const expenseEntrySchema = financeEntrySchema.extend({
  vatRate: z.coerce.number({ error: "Enter a VAT rate" }).min(0, "Cannot be negative").max(100, "Cannot be more than 100").default(0),
});

export type ExpenseEntryFormValues = z.input<typeof expenseEntrySchema>;
export type ExpenseEntryValues = z.output<typeof expenseEntrySchema>;

export type FinanceEntryFormValues = z.input<typeof financeEntrySchema>;
export type FinanceEntryValues = z.output<typeof financeEntrySchema>;

export const categoryNameSchema = z.string().trim().min(1, "Enter a category name").max(60);

/** Date range filter (?from=&to=) used by Finance and the Dashboard. */
export type DateRange = { from: string | null; to: string | null };

export function parseDateRange(raw: Record<string, string | string[] | undefined>): DateRange {
  const pick = (k: string) => {
    const v = Array.isArray(raw[k]) ? raw[k]?.[0] : raw[k];
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
  };
  return { from: pick("from"), to: pick("to") };
}
