import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemForm } from "@/components/items/item-form";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { getItem, listItemCategories } from "@/lib/data/items";
import { getItemModifierGroupIds } from "@/lib/data/modifiers";
import { getCurrentBranch } from "@/lib/data/platform";
import { getAppSettings } from "@/lib/data/settings";
import { listModifierGroups } from "@/lib/data/modifiers";
import { posTypeHasCapability } from "@/lib/platform/pos-types";

export const metadata: Metadata = { title: "Edit Item" };

export default async function EditItemPage({ params }: PageProps<"/pos/products/[id]/edit">) {
  const { id } = await params;
  await requireModule("POS", "INVENTORY", "edit");
  const [item, categories, branch, settings] = await Promise.all([
    getItem(id),
    listItemCategories({ activeOnly: true }),
    getCurrentBranch(),
    getAppSettings(),
  ]);
  if (!item) notFound();
  const posType = branch.posConfig?.businessType ?? "RETAIL";
  const asksQuestions = posTypeHasCapability(posType, "MODIFIERS");
  // What this industry needs from an item: a barcode to scan, a PLU to weigh, a size matrix to sell.
  const scansCodes = posTypeHasCapability(posType, "BARCODE");
  const weighsGoods = posTypeHasCapability(posType, "WEIGHT");
  const sellsVariants = posTypeHasCapability(posType, "VARIANTS");
  const [groups, attached] = await Promise.all([
    asksQuestions ? listModifierGroups({ activeOnly: true }) : Promise.resolve([]),
    asksQuestions ? getItemModifierGroupIds(item.id) : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        title={item.name}
        description={item.kind === "SERVICE" ? "Service" : "Product"}
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
        item={item}
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
        attachedGroupIds={attached}
        scansCodes={scansCodes}
        weighsGoods={weighsGoods}
        sellsVariants={sellsVariants}
      />
    </>
  );
}
