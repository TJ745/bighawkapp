import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { getStockLevels } from "@/lib/business/inventory";
import { round2 } from "@/lib/business/totals";

/** Reads for the recipe book. */

/** Every dish that has a recipe, with what it costs in ingredients. */
export async function listRecipes() {
  const variants = await db.itemVariant.findMany({
    where: { recipe: { some: {} } },
    orderBy: [{ item: { name: "asc" } }, { sortOrder: "asc" }],
    include: {
      item: { select: { id: true, name: true, unit: true, salePrice: true, isActive: true } },
      recipe: {
        orderBy: { sortOrder: "asc" },
        include: {
          ingredient: {
            select: { id: true, name: true, costPrice: true, item: { select: { name: true, unit: true, costPrice: true, trackStock: true } } },
          },
        },
      },
    },
  });

  return variants.map((variant) => {
    const components = variant.recipe.map((component) => {
      const unitCost = component.ingredient.costPrice === null ? num(component.ingredient.item.costPrice) : num(component.ingredient.costPrice);
      return {
        ingredientVariantId: component.ingredient.id,
        name:
          component.ingredient.name && component.ingredient.name !== component.ingredient.item.name
            ? `${component.ingredient.item.name} — ${component.ingredient.name}`
            : component.ingredient.item.name,
        unit: component.ingredient.item.unit,
        quantity: num(component.quantity),
        unitCost,
        trackStock: component.ingredient.item.trackStock,
        lineCost: round2(num(component.quantity) * unitCost),
      };
    });

    const cost = round2(components.reduce((sum, component) => sum + component.lineCost, 0));
    const price = variant.salePrice === null ? num(variant.item.salePrice) : num(variant.salePrice);
    return {
      variantId: variant.id,
      itemId: variant.item.id,
      name: variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name,
      unit: variant.item.unit,
      isActive: variant.isActive && variant.item.isActive,
      price,
      cost,
      /** What is left of the price once the ingredients are paid for. */
      margin: round2(price - cost),
      components,
    };
  });
}

export type RecipeRow = Awaited<ReturnType<typeof listRecipes>>[number];

/**
 * Variants that may take part in a recipe: everything sellable, with a flag for whether each one
 * is usable as an ingredient (nothing that has a recipe of its own, nothing that is a service).
 */
export async function listRecipeCandidates(branchId: string) {
  const variants = await db.itemVariant.findMany({
    where: { isActive: true, item: { isActive: true } },
    orderBy: [{ item: { name: "asc" } }, { sortOrder: "asc" }],
    include: {
      item: { select: { name: true, unit: true, kind: true, trackStock: true, costPrice: true } },
      recipe: { select: { id: true } },
      usedIn: { select: { id: true } },
    },
  });

  const stock = await getStockLevels(
    variants.filter((v) => v.item.trackStock).map((v) => v.id),
    branchId,
  );

  return variants.map((variant) => ({
    variantId: variant.id,
    name: variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name,
    unit: variant.item.unit,
    kind: variant.item.kind,
    trackStock: variant.item.trackStock,
    unitCost: variant.costPrice === null ? num(variant.item.costPrice) : num(variant.costPrice),
    stock: variant.item.trackStock ? (stock.get(variant.id) ?? 0) : null,
    hasRecipe: variant.recipe.length > 0,
    /** Used as an ingredient elsewhere, so it may not have a recipe of its own. */
    isIngredient: variant.usedIn.length > 0,
  }));
}

export type RecipeCandidate = Awaited<ReturnType<typeof listRecipeCandidates>>[number];
