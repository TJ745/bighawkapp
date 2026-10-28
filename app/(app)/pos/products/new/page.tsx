import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { listItemCategories } from "@/lib/data/items";
import { getCurrentBranch, listBranches } from "@/lib/data/platform";
import { getAppSettings } from "@/lib/data/settings";
import { listModifierGroups } from "@/lib/data/modifiers";
import { posTypeHasCapability } from "@/lib/platform/pos-types";

export const metadata: Metadata = { title: "New Item" };

export default async function NewItemPage() {
  await requireModule("POS", "INVENTORY", "create");
  const [categories, branch, settings, allBranches] = await Promise.all([
    listItemCategories({ activeOnly: true }),
    getCurrentBranch(),
    getAppSettings(),
    // Unscoped on purpose, like Settings → Branches: deciding where something is sold is not the
    // same as working there, and a head-office manager pins items for shops they never stand in.
    listBranches(),
  ]);
  const branches = allBranches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }));
  const posType = branch.posConfig?.businessType ?? "RETAIL";
  const asksQuestions = posTypeHasCapability(posType, "MODIFIERS");
  // What this industry needs from an item: a barcode to scan, a PLU to weigh, a size matrix to sell.
  const scansCodes = posTypeHasCapability(posType, "BARCODE");
  const weighsGoods = posTypeHasCapability(posType, "WEIGHT");
  const sellsVariants = posTypeHasCapability(posType, "VARIANTS");
  const groups = asksQuestions ? await listModifierGroups({ activeOnly: true }) : [];

  return (
    <>
      <PageHeader
        title="New Item"
        actions={
          <Button asChild variant="ghost">
            <Link href="/pos/products">
              <ArrowLeft />
              All items
            </Link>
          </Button>
        }
      />
      <ItemForm
        categories={categories}
        branchName={branch.name}
        defaultVatRate={settings.defaultVatRate}
        modifierGroups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          optionCount: group.options.filter((option) => option.isActive).length,
        }))}
        scansCodes={scansCodes}
        weighsGoods={weighsGoods}
        sellsVariants={sellsVariants}
        branches={branches}
      />
    </>
  );
}
