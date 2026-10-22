import { z } from "zod";
import { AppModule, PosBusinessType, ScaleBarcodeMode } from "@/lib/generated/prisma/enums";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const moduleToggleSchema = z.object({
  module: z.enum(AppModule),
  enabled: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
});

export const branchSchema = z.object({
  // Short code used on documents and register names; uppercase so it reads as an identifier.
  code: z
    .string()
    .trim()
    .min(2, "Code must be at least 2 characters")
    .max(12, "Code must be at most 12 characters")
    .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only")
    .transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Branch name is required").max(150),
  phone: optionalText(50),
  city: optionalText(100),
  address: optionalText(300),
  vatNumber: optionalText(50),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

export const posConfigurationSchema = z.object({
  branchId: z.string().min(1, "Choose a branch"),
  businessType: z.enum(PosBusinessType),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
  receiptHeader: z.string().trim().max(300).default(""),
  receiptFooter: z.string().trim().max(300).default(""),
  // Scale labels — only meaningful for industries with the WEIGHT capability.
  scaleBarcodeEnabled: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(false),
  scaleBarcodePrefix: z
    .string()
    .trim()
    .min(1, "Enter the prefix")
    .max(2, "At most 2 digits")
    .regex(/^\d+$/, "Digits only")
    .default("2"),
  scaleCodeDigits: z.coerce.number().int().min(3, "At least 3").max(8, "At most 8").default(6),
  scaleBarcodeMode: z.enum(ScaleBarcodeMode).default("WEIGHT"),
});

export type BranchInput = z.input<typeof branchSchema>;
export type BranchValues = z.output<typeof branchSchema>;
export type PosConfigurationInput = z.input<typeof posConfigurationSchema>;
