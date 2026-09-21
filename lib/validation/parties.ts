import { z } from "zod";
import { PartyDocumentCategory, PartyType } from "@/lib/generated/prisma/enums";

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

// Shared by customers and suppliers: both are a company or an individual with the same contact/bank fields.
export const partySchema = z
  .object({
    type: z.enum(PartyType),
    name: z.string().trim().min(1, "Name is required").max(150),
    contactPerson: text(100),
    phone: z.string().trim().min(1, "Phone is required").max(50),
    email: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : null))
      .pipe(z.email("Enter a valid email address").nullable()),
    address: text(500),
    vatNumber: text(50),
    crNumber: text(50),
    nationalAddress: text(300),
    bankName: text(100),
    accountName: text(150),
    iban: text(50),
    accountNumber: text(50),
    notes: text(2000),
  })
  .transform((v) => ({
    ...v,
    // Individuals have no contact person or CR number.
    contactPerson: v.type === "INDIVIDUAL" ? null : v.contactPerson,
    crNumber: v.type === "INDIVIDUAL" ? null : v.crNumber,
  }));

export type PartyFormValues = z.input<typeof partySchema>;
export type PartyValues = z.output<typeof partySchema>;

export const partyDocumentCategorySchema = z.enum(PartyDocumentCategory);

export const PARTY_DOCUMENT_CATEGORIES: { value: PartyDocumentCategory; label: string }[] = [
  { value: "VAT_CERTIFICATE", label: "VAT Certificate" },
  { value: "CR_CERTIFICATE", label: "CR Certificate" },
  { value: "BANK_CERTIFICATE", label: "Bank Certificate" },
  { value: "NATIONAL_ADDRESS", label: "National Address" },
  { value: "OTHER", label: "Other Document" },
];

export function documentCategoryLabel(category: PartyDocumentCategory) {
  return PARTY_DOCUMENT_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
