import { z } from "zod";
import { dateOnlySchema, lineItemSchema } from "./sales";

// nullish() for the same reason as in ./sales: the server re-parses the client-parsed payload.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const optionalId = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null));

const base = {
  supplierId: z.string().min(1, "Choose a supplier"),
  date: dateOnlySchema,
  supplierReference: optionalText(100),
  notes: optionalText(5000),
  items: z.array(lineItemSchema).min(1, "Add at least one item"),
};

export const supplierQuotationSchema = z.object({
  ...base,
  validUntil: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null))
    .pipe(dateOnlySchema.nullable()),
});

export const purchaseSchema = z.object({
  ...base,
  customerId: optionalId,
  projectId: optionalId,
  paymentTermDays: z.coerce.number().int().min(0).max(365),
  dueDate: dateOnlySchema,
});

export type SupplierQuotationFormValues = z.input<typeof supplierQuotationSchema>;
export type SupplierQuotationValues = z.output<typeof supplierQuotationSchema>;
export type PurchaseFormValues = z.input<typeof purchaseSchema>;
export type PurchaseValues = z.output<typeof purchaseSchema>;
