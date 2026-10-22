"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizePosCapability } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { assertRecipeAllowed } from "@/lib/business/recipes";
import { getCurrentBranch } from "@/lib/data/platform";
import { recordAudit } from "@/lib/platform/audit";
import { recipeSchema } from "@/lib/validation/recipes";

/**
 * The recipe book. Maintaining it is `INVENTORY` work — the same permission as the catalogue and
 * stock it spends — behind the RECIPES capability.
 */

/**
 * Saves a dish's whole recipe. An empty component list removes the recipe, which hands the dish
 * back to ordinary stock tracking; past sales keep their own record of what they consumed.
 */
export async function saveRecipe(input: unknown): Promise<ActionResult<{ components: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("RECIPES", "INVENTORY", "edit");
    const data = parseInput(recipeSchema, input);
    const branch = await getCurrentBranch();

    const variant = await db.itemVariant.findUnique({
      where: { id: data.variantId },
      select: { id: true, name: true, item: { select: { name: true } } },
    });
    if (!variant) throw new BusinessError("That product no longer exists.");

    if (data.components.length > 0) {
      await assertRecipeAllowed(
        data.variantId,
        data.components.map((component) => component.ingredientVariantId),
      );
    }

    await db.$transaction(async (tx) => {
      // The recipe is replaced wholesale, so the rows always match what was on screen.
      await tx.recipeComponent.deleteMany({ where: { variantId: data.variantId } });
      if (data.components.length === 0) return;
      await tx.recipeComponent.createMany({
        data: data.components.map((component, index) => ({
          variantId: data.variantId,
          ingredientVariantId: component.ingredientVariantId,
          quantity: component.quantity,
          sortOrder: index,
        })),
      });
    });

    await recordAudit({
      auth,
      action: data.components.length === 0 ? "pos.recipe_removed" : "pos.recipe_saved",
      entity: "ItemVariant",
      entityId: data.variantId,
      branchId: branch.id,
      summary:
        data.components.length === 0
          ? `Recipe removed from ${variant.item.name}`
          : `Recipe for ${variant.item.name}: ${data.components.length} ingredients`,
    });

    revalidatePath("/pos/recipes");
    revalidatePath("/pos/products");
    revalidatePath("/pos/register");
    return { components: data.components.length };
  });
}
