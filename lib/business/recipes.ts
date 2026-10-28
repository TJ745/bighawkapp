import "server-only";
import { db, type Tx } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { applyStockMovement, round3 } from "./inventory";
import { round2 } from "./totals";

/**
 * Recipes: what a dish takes out of stock when it sells.
 *
 * A kitchen does not count lattes, it counts milk. So a variant with a recipe does **not** move
 * its own stock when sold — its ingredients do. That is one rule, applied in one place
 * (`consumeIngredients`), and it is why nothing is ever deducted twice.
 *
 * Recipes are one level deep: an ingredient may not itself have a recipe. Sub-recipes would make
 * what a sale consumes impossible to see from the rows in front of a person, so they are refused
 * at the point the recipe is saved.
 */

export type RecipeLine = {
  ingredientVariantId: string;
  name: string;
  unit: string;
  /** Per one unit of the dish. */
  quantity: number;
  unitCost: number;
  trackStock: boolean;
};

/** The recipes of several variants at once, keyed by the variant that is sold. */
export async function getRecipes(variantIds: string[]): Promise<Map<string, RecipeLine[]>> {
  const unique = [...new Set(variantIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const components = await db.recipeComponent.findMany({
    where: { variantId: { in: unique } },
    orderBy: { sortOrder: "asc" },
    include: {
      ingredient: {
        select: {
          id: true,
          name: true,
          costPrice: true,
          item: { select: { name: true, unit: true, costPrice: true, trackStock: true } },
        },
      },
    },
  });

  const recipes = new Map<string, RecipeLine[]>();
  for (const component of components) {
    const ingredient = component.ingredient;
    const line: RecipeLine = {
      ingredientVariantId: ingredient.id,
      name: ingredient.name && ingredient.name !== ingredient.item.name ? `${ingredient.item.name} — ${ingredient.name}` : ingredient.item.name,
      unit: ingredient.item.unit,
      quantity: num(component.quantity),
      unitCost: ingredient.costPrice === null ? num(ingredient.item.costPrice) : num(ingredient.costPrice),
      trackStock: ingredient.item.trackStock,
    };
    recipes.set(component.variantId, [...(recipes.get(component.variantId) ?? []), line]);
  }
  return recipes;
}

/** What one unit of the dish costs in ingredients. Used when the dish has no cost of its own. */
export function recipeCost(lines: RecipeLine[]) {
  return round2(lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0));
}

/**
 * Takes the ingredients of one sold line out of stock and snapshots what was taken, so a void or a
 * return can put back exactly that — even if the recipe changes in between.
 */
export async function consumeIngredients(
  tx: Tx,
  input: {
    saleItemId: string;
    lines: RecipeLine[];
    /** How many of the dish were sold. */
    soldQuantity: number;
    branchId: string;
    reference: string;
    referenceId: string;
    user: { id: string; name: string };
  },
) {
  for (const [index, line] of input.lines.entries()) {
    const quantity = round3(line.quantity * input.soldQuantity);
    if (quantity <= 0) continue;

    await tx.posSaleItemIngredient.create({
      data: {
        saleItemId: input.saleItemId,
        variantId: line.ingredientVariantId,
        name: line.name,
        unit: line.unit,
        quantity,
        unitCost: line.unitCost,
        sortOrder: index,
      },
    });

    // An ingredient nobody counts (tap water, say) is still recorded on the sale, but there is no
    // stock level to move.
    if (!line.trackStock) continue;
    await applyStockMovement(tx, {
      variantId: line.ingredientVariantId,
      branchId: input.branchId,
      kind: "SALE",
      quantity: -quantity,
      unitCost: line.unitCost,
      referenceType: "POS_SALE",
      referenceId: input.referenceId,
      reference: input.reference,
      note: "Recipe",
      userId: input.user.id,
      userName: input.user.name,
    });
  }
}

/**
 * Puts ingredients back, from the snapshot rather than from today's recipe. `portion` is how much
 * of the line is coming back: 1 for a void, or returned ÷ sold for a partial return.
 */
export async function returnIngredients(
  tx: Tx,
  input: {
    saleItemId: string;
    portion: number;
    branchId: string;
    reference: string;
    referenceId: string;
    referenceType: string;
    note: string;
    user: { id: string; name: string };
  },
) {
  if (input.portion <= 0) return;
  const consumed = await tx.posSaleItemIngredient.findMany({ where: { saleItemId: input.saleItemId }, orderBy: { sortOrder: "asc" } });

  for (const row of consumed) {
    const quantity = round3(num(row.quantity) * Math.min(1, input.portion));
    if (quantity <= 0 || !row.variantId) continue;
    const variant = await tx.itemVariant.findUnique({ where: { id: row.variantId }, select: { item: { select: { trackStock: true } } } });
    if (!variant?.item.trackStock) continue;
    await applyStockMovement(tx, {
      variantId: row.variantId,
      branchId: input.branchId,
      kind: "SALE_RETURN",
      quantity,
      unitCost: num(row.unitCost),
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      reference: input.reference,
      note: input.note,
      userId: input.user.id,
      userName: input.user.name,
    });
  }
}

/**
 * Checks a recipe before it is saved: no dish as its own ingredient, no ingredient that has a
 * recipe of its own, and nothing that is not sellable stock.
 */
export async function assertRecipeAllowed(variantId: string, ingredientVariantIds: string[]) {
  if (ingredientVariantIds.includes(variantId)) throw new BusinessError("A dish cannot be an ingredient of itself.");
  if (new Set(ingredientVariantIds).size !== ingredientVariantIds.length) {
    throw new BusinessError("Each ingredient can only be listed once — add up the quantity instead.");
  }

  const ingredients = await db.itemVariant.findMany({
    where: { id: { in: ingredientVariantIds } },
    select: { id: true, name: true, item: { select: { name: true, kind: true } }, recipe: { select: { id: true } } },
  });
  if (ingredients.length !== new Set(ingredientVariantIds).size) throw new BusinessError("One of those ingredients no longer exists.");

  for (const ingredient of ingredients) {
    if (ingredient.recipe.length > 0) {
      throw new BusinessError(`${ingredient.item.name} has a recipe of its own, so it cannot be used as an ingredient.`);
    }
    if (ingredient.item.kind !== "PRODUCT") {
      throw new BusinessError(`${ingredient.item.name} is a service, so there is nothing to take out of stock.`);
    }
  }

  // The other direction: this dish must not already be an ingredient somewhere, or that recipe
  // would quietly become two levels deep.
  const usedIn = await db.recipeComponent.findFirst({
    where: { ingredientVariantId: variantId },
    select: { variant: { select: { item: { select: { name: true } } } } },
  });
  if (usedIn) {
    throw new BusinessError(`This is an ingredient of ${usedIn.variant.item.name}, so it cannot have a recipe of its own.`);
  }
}
