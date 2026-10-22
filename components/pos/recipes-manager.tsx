"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CookingPot, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/shared/combobox";
import { EmptyState } from "@/components/shared/empty-state";
import { FormField } from "@/components/shared/form-field";
import { StatusBadge } from "@/components/shared/status-badge";
import { useFormat } from "@/components/providers/format-provider";
import { saveRecipe } from "@/actions/recipes";

export type RecipeView = {
  variantId: string;
  name: string;
  price: number;
  cost: number;
  margin: number;
  isActive: boolean;
  components: { ingredientVariantId: string; name: string; unit: string; quantity: number; lineCost: number; trackStock: boolean }[];
};

export type CandidateView = {
  variantId: string;
  name: string;
  unit: string;
  kind: string;
  trackStock: boolean;
  unitCost: number;
  stock: number | null;
  hasRecipe: boolean;
  isIngredient: boolean;
};

type Props = {
  recipes: RecipeView[];
  candidates: CandidateView[];
  canEdit: boolean;
};

/**
 * The recipe book: what each dish takes out of stock, and what that costs. Selling the dish moves
 * the ingredients, never the dish itself — so this screen is where a kitchen's stock is really set.
 */
export function RecipesManager({ recipes, candidates, canEdit }: Props) {
  const format = useFormat();
  const [editing, setEditing] = useState<RecipeView | null>(null);
  const [open, setOpen] = useState(false);

  const newButton = canEdit ? (
    <Button
      onClick={() => {
        setEditing(null);
        setOpen(true);
      }}
    >
      <Plus />
      New Recipe
    </Button>
  ) : null;

  return (
    <>
      {recipes.length === 0 ? (
        <EmptyState
          icon={CookingPot}
          title="No recipes yet"
          description="Give a dish a recipe and selling it will take its ingredients out of stock instead of the dish."
          action={newButton}
        />
      ) : (
        <>
          {newButton ? <div className="flex justify-end">{newButton}</div> : null}
          <div className="grid gap-4 lg:grid-cols-2">
            {recipes.map((recipe) => (
              <Card key={recipe.variantId}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {recipe.name}
                    {!recipe.isActive ? <StatusBadge tone="neutral">Not selling</StatusBadge> : null}
                  </CardTitle>
                  <CardDescription>
                    Sells for {format.money(recipe.price)} · ingredients {format.money(recipe.cost)} · leaves {format.money(recipe.margin)}
                  </CardDescription>
                  {canEdit ? (
                    <div className="row-start-1 justify-self-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit the recipe for ${recipe.name}`}
                        onClick={() => {
                          setEditing(recipe);
                          setOpen(true);
                        }}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <ul className="divide-y text-sm">
                    {recipe.components.map((component) => (
                      <li key={component.ingredientVariantId} className="flex items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{component.name}</span>
                          {!component.trackStock ? <span className="block text-xs text-muted-foreground">Not counted in stock</span> : null}
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block tabular-nums">
                            {format.number(component.quantity)} {component.unit}
                          </span>
                          <span className="block text-xs text-muted-foreground tabular-nums">{format.money(component.lineCost)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Recipe for ${editing.name}` : "New recipe"}</DialogTitle>
            <DialogDescription>
              Say how much of each ingredient one {editing ? "portion" : "unit"} uses. Selling it takes exactly that out of stock.
            </DialogDescription>
          </DialogHeader>
          {open ? <RecipeForm recipe={editing} candidates={candidates} onClose={() => setOpen(false)} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

type Row = { key: string; ingredientVariantId: string; quantity: string };

function RecipeForm({ recipe, candidates, onClose }: { recipe: RecipeView | null; candidates: CandidateView[]; onClose: () => void }) {
  const router = useRouter();
  const format = useFormat();
  const [variantId, setVariantId] = useState(recipe?.variantId ?? "");
  const [rows, setRows] = useState<Row[]>(
    recipe
      ? recipe.components.map((component, index) => ({
          key: `${component.ingredientVariantId}-${index}`,
          ingredientVariantId: component.ingredientVariantId,
          quantity: String(component.quantity),
        }))
      : [{ key: "row-0", ingredientVariantId: "", quantity: "1" }],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A dish may not be something that is already an ingredient, and an ingredient may not be
  // something that has its own recipe — the server refuses both; this keeps them off the list.
  const dishes = candidates.filter((candidate) => !candidate.isIngredient || candidate.variantId === recipe?.variantId);
  const ingredients = candidates.filter((candidate) => !candidate.hasRecipe && candidate.kind === "PRODUCT" && candidate.variantId !== variantId);

  const cost = rows.reduce((sum, row) => {
    const ingredient = candidates.find((candidate) => candidate.variantId === row.ingredientVariantId);
    return sum + (ingredient ? ingredient.unitCost * (Number(row.quantity) || 0) : 0);
  }, 0);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      const result = await saveRecipe({
        variantId,
        components: rows
          .filter((row) => row.ingredientVariantId && Number(row.quantity) > 0)
          .map((row) => ({ ingredientVariantId: row.ingredientVariantId, quantity: Number(row.quantity) })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      toast.success(result.data.components === 0 ? "Recipe removed" : "Recipe saved");
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <FormField label="What is being made" htmlFor="recipe-dish" required>
          <Combobox
            options={dishes.map((dish) => ({ value: dish.variantId, label: dish.name }))}
            value={variantId}
            onChange={setVariantId}
            placeholder="Choose a product"
            searchPlaceholder="Search products…"
            disabled={Boolean(recipe)}
          />
        </FormField>

        <div className="space-y-2">
          <p className="text-sm font-medium">Ingredients</p>
          {rows.map((row) => {
            const ingredient = candidates.find((candidate) => candidate.variantId === row.ingredientVariantId);
            return (
              <div key={row.key} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Combobox
                    options={ingredients.map((candidate) => ({ value: candidate.variantId, label: candidate.name }))}
                    value={row.ingredientVariantId}
                    onChange={(value) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, ingredientVariantId: value } : r)))}
                    placeholder="Choose an ingredient"
                    searchPlaceholder="Search stock…"
                  />
                </div>
                <div className="w-28 shrink-0">
                  <Input
                    value={row.quantity}
                    onChange={(e) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, quantity: e.target.value } : r)))}
                    inputMode="decimal"
                    aria-label="How much is used"
                  />
                </div>
                <span className="w-12 shrink-0 pb-2 text-xs text-muted-foreground">{ingredient?.unit ?? ""}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove ingredient"
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRows((prev) => [...prev, { key: `row-${Date.now()}`, ingredientVariantId: "", quantity: "1" }])}
          >
            <Plus />
            Add ingredient
          </Button>
          {rows.length === 0 ? <p className="text-xs text-muted-foreground">Saving with no ingredients removes the recipe.</p> : null}
        </div>

        <p className="text-sm text-muted-foreground">
          Ingredients cost <span className="font-medium tabular-nums">{format.money(cost)}</span> per portion.
        </p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={saving || !variantId}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Save recipe
        </Button>
      </DialogFooter>
    </>
  );
}
