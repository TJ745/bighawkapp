import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const modifierOptionSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Option name is required").max(100),
  /** May be negative: "no cheese −2.00" is as valid as "extra shot +3.00". */
  priceDelta: z.coerce.number({ error: "Enter a price change" }).min(-99_999).max(99_999).default(0),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const modifierGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Group name is required").max(100),
    prompt: optionalText(150),
    minSelect: z.coerce.number().int().min(0, "0 or more").max(20).default(0),
    maxSelect: z.coerce.number().int().min(1, "At least 1").max(20).default(1),
    sortOrder: z.coerce.number().int().min(0).max(999).default(0),
    isActive: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()).default(true),
    options: z.array(modifierOptionSchema).min(1, "Add at least one option"),
  })
  .superRefine((value, ctx) => {
    if (value.minSelect > value.maxSelect) {
      ctx.addIssue({ code: "custom", path: ["minSelect"], message: "The minimum cannot exceed the maximum." });
    }
    const active = value.options.filter((option) => option.isActive);
    if (active.length < value.minSelect) {
      ctx.addIssue({ code: "custom", path: ["options"], message: `At least ${value.minSelect} active options are needed to satisfy the minimum.` });
    }
    const names = active.map((option) => option.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Two options share a name." });
    }
    // A single-choice group pre-selecting two options would be contradictory.
    if (value.maxSelect === 1 && active.filter((option) => option.isDefault).length > 1) {
      ctx.addIssue({ code: "custom", path: ["options"], message: "Only one option can be pre-selected when just one may be chosen." });
    }
  });

/** Which groups an item asks about. Order is the order they appear at the till. */
export const itemModifierGroupsSchema = z.object({
  itemId: z.string().min(1),
  groupIds: z.array(z.string().min(1)).max(20),
});

export type ModifierGroupInput = z.input<typeof modifierGroupSchema>;
export type ModifierOptionInput = z.input<typeof modifierOptionSchema>;
