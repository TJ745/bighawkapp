import type { Metadata } from "next";
import { RecipesManager } from "@/components/pos/recipes-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRecipeCandidates, listRecipes } from "@/lib/data/recipes";

export const metadata: Metadata = { title: "Recipes" };

/** The recipe book: what each dish takes out of stock when it sells. */
export default async function RecipesPage() {
  const auth = await requirePosCapability("RECIPES", "INVENTORY", "view");
  const branch = await getCurrentBranch();
  const [recipes, candidates] = await Promise.all([listRecipes(), listRecipeCandidates(branch.id)]);

  return (
    <>
      <PageHeader
        title="Recipes"
        description="Selling a dish takes its ingredients out of stock — not the dish itself — so stock stays honest without counting plates."
      />
      <RecipesManager
        recipes={recipes.map((recipe) => ({
          variantId: recipe.variantId,
          name: recipe.name,
          price: recipe.price,
          cost: recipe.cost,
          margin: recipe.margin,
          isActive: recipe.isActive,
          components: recipe.components.map((component) => ({
            ingredientVariantId: component.ingredientVariantId,
            name: component.name,
            unit: component.unit,
            quantity: component.quantity,
            lineCost: component.lineCost,
            trackStock: component.trackStock,
          })),
        }))}
        candidates={candidates}
        canEdit={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
