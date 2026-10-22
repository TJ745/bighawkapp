import type { Metadata } from "next";
import { PriceListsManager } from "@/components/pos/price-lists-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRegisterItems } from "@/lib/data/pos";
import { listCustomerPriceLists, listPriceLists } from "@/lib/data/pricing";

export const metadata: Metadata = { title: "Price lists" };

/** Who pays what. The till shows these prices and the sale engine charges them. */
export default async function PriceListsPage() {
  const auth = await requirePosCapability("PRICE_LISTS", "INVENTORY", "view");
  const branch = await getCurrentBranch();
  const [lists, items, customers] = await Promise.all([listPriceLists(), listRegisterItems(branch.id), listCustomerPriceLists()]);

  return (
    <>
      <PageHeader
        title="Price lists"
        description="Trade prices, customer prices and quantity breaks. A customer with no list of their own pays the default list."
      />
      <PriceListsManager
        lists={lists}
        products={items.map((item) => ({
          variantId: item.variantId,
          name: item.variantName ? `${item.name} — ${item.variantName}` : item.name,
          price: item.price,
          unit: item.unit,
        }))}
        customers={customers}
        canCreate={auth.can("INVENTORY", "create")}
        canEdit={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
