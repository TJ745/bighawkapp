import { z } from "zod";

const quantity = z.coerce
  .number({ error: "Enter how much is used" })
  .positive("Must be more than 0")
  .max(9_999_999, "Too large")
  // Stock is kept to three decimals, so a recipe cannot ask for more precision than that.
  .transform((v) => Math.round(v * 1000) / 1000);

/**
 * Only shapes and numbers here. Whether the *combination* makes sense — a dish as its own
 * ingredient, the same ingredient twice, a recipe two levels deep — is checked in
 * `assertRecipeAllowed`, which says what is wrong in a sentence instead of leaving a dialog
 * reporting highlighted fields that do not exist.
 */
export const recipeSchema = z.object({
  variantId: z.string().min(1, "Choose what is being made"),
  components: z
    .array(
      z.object({
        ingredientVariantId: z.string().min(1, "Choose an ingredient"),
        quantity,
      }),
    )
    .max(50, "That is a lot of ingredients"),
});

export type RecipeInput = z.input<typeof recipeSchema>;
