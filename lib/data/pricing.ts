import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { round2 } from "@/lib/business/totals";

/** Reads for the price list screens. */

export async function listPriceLists() {
  const lists = await db.priceList.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      items: {
        orderBy: { variant: { item: { name: "asc" } } },
        include: {
          tiers: { orderBy: { minQuantity: "asc" } },
          variant: { select: { id: true, name: true, salePrice: true, item: { select: { name: true, salePrice: true, unit: true } } } },
        },
      },
      customers: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } },
    },
  });

  return lists.map((list) => ({
    id: list.id,
    name: list.name,
    description: list.description,
    isDefault: list.isDefault,
    isActive: list.isActive,
    customers: list.customers,
    items: list.items.map((item) => {
      const catalogue = item.variant.salePrice === null ? num(item.variant.item.salePrice) : num(item.variant.salePrice);
      const fixed = item.price === null ? null : num(item.price);
      const discount = num(item.discountPercent);
      return {
        variantId: item.variant.id,
        name: item.variant.name && item.variant.name !== item.variant.item.name ? `${item.variant.item.name} — ${item.variant.name}` : item.variant.item.name,
        unit: item.variant.item.unit,
        catalogue,
        price: fixed,
        discountPercent: discount,
        /** What one unit costs on this list, before any quantity break. */
        effective: fixed ?? (discount > 0 ? round2(catalogue * (1 - discount / 100)) : catalogue),
        tiers: item.tiers.map((tier) => ({ minQuantity: num(tier.minQuantity), price: num(tier.price) })),
      };
    }),
  }));
}

export type PriceListRow = Awaited<ReturnType<typeof listPriceLists>>[number];
export type PriceListEntry = PriceListRow["items"][number];

/** Customers and which list each is on, for the assignment picker. */
export async function listCustomerPriceLists() {
  const customers = await db.customer.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, priceListId: true, priceList: { select: { name: true } } },
  });
  return customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    listId: customer.priceListId,
    listName: customer.priceList?.name ?? null,
  }));
}

export type CustomerPriceListRow = Awaited<ReturnType<typeof listCustomerPriceLists>>[number];
