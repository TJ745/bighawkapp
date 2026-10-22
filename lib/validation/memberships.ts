import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

/**
 * A plan. Only shapes and numbers here; whether the combination makes sense (an item that is not a
 * service, a plan that promises nothing) is checked in the action, where it can be said in a
 * sentence.
 */
export const membershipPlanSchema = z.object({
  name: z.string().trim().min(1, "Give the plan a name").max(80),
  description: optionalText(300),
  variantId: z.string().min(1, "Choose what is rung up when it is sold"),
  durationDays: z.coerce.number({ error: "Enter how long it runs" }).int("Whole days only").min(1, "At least a day").max(3650, "At most ten years"),
  sessionCount: z.coerce.number({ error: "Enter the number of sessions" }).int("Whole sessions only").min(0, "0 or more").max(999, "At most 999").default(0),
  discountPercent: z.coerce.number({ error: "Enter a percentage" }).min(0, "0–100").max(100, "0–100").default(0),
  /** Empty covers every service. */
  serviceVariantIds: z.array(z.string().min(1)).max(100).default([]),
  isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
});

export const cancelMembershipSchema = z.object({
  membershipId: z.string().min(1),
  reason: z.string().trim().min(1, "Give a reason").max(300),
});

export const MEMBERSHIP_STATUS_LABELS = {
  ACTIVE: { label: "Active", tone: "success" },
  EXPIRED: { label: "Expired", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
} as const;

export type MembershipPlanInput = z.input<typeof membershipPlanSchema>;
