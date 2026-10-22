import type { Metadata } from "next";
import { CategoriesManager } from "@/components/items/categories-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requireModule } from "@/lib/auth/session";
import { listItemCategories } from "@/lib/data/items";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const auth = await requireModule("POS", "INVENTORY", "view");
  const categories = await listItemCategories();

  return (
    <>
      <PageHeader title="Categories" description="Group what you sell so the register and reports stay navigable." />
      <CategoriesManager categories={categories} canCreate={auth.can("INVENTORY", "create")} canEdit={auth.can("INVENTORY", "edit")} />
    </>
  );
}
