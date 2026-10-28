import "server-only";
import { db, type Tx } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { round2 } from "./totals";

/**
 * Customer and quantity pricing.
 *
 * A wholesaler sells the same box at three prices: list, trade, and "you're buying a pallet". All
 * three are decided **here**, from the customer's price list, and never by the browser — the till
 * sends the quantity and who is buying, and is told what the line costs.
 *
 * One rule, in one place: the highest quantity tier the line reaches wins; failing that a fixed
 * price on the list; failing that a percentage off the catalogue; failing that the catalogue price.
 */

export type PriceRule = {
  variantId: string;
  /** A price that replaces the catalogue price, or null to discount the catalogue price instead. */
  price: number | null;
  discountPercent: number;
  /** Ascending by quantity; the last one the line reaches is the one that applies. */
  tiers: { minQuantity: number; price: number }[];
};

export type PriceContext = {
  listId: string;
  listName: string;
  /** Whether this is the company default rather than the customer's own list. */
  isDefault: boolean;
  rules: Map<string, PriceRule>;
};

/**
 * The prices this customer gets: their own list, else the default list, else nothing (and the
 * catalogue price stands). Withdrawn lists are ignored, so taking a list out of use puts its
 * customers back on the default without editing every one of them.
 */
export async function getPriceContext(customerId: string | null): Promise<PriceContext | null> {
  const customer = customerId
    ? await db.customer.findUnique({ where: { id: customerId }, select: { priceList: { select: { id: true, name: true, isActive: true } } } })
    : null;

  const chosen =
    customer?.priceList && customer.priceList.isActive
      ? { id: customer.priceList.id, name: customer.priceList.name, isDefault: false }
      : await db.priceList
          .findFirst({ where: { isDefault: true, isActive: true }, select: { id: true, name: true } })
          .then((list) => (list ? { id: list.id, name: list.name, isDefault: true } : null));
  if (!chosen) return null;

  const items = await db.priceListItem.findMany({
    where: { listId: chosen.id },
    include: { tiers: { orderBy: { minQuantity: "asc" } } },
  });

  return {
    listId: chosen.id,
    listName: chosen.name,
    isDefault: chosen.isDefault,
    rules: new Map(
      items.map((item) => [
        item.variantId,
        {
          variantId: item.variantId,
          price: item.price === null ? null : num(item.price),
          discountPercent: num(item.discountPercent),
          tiers: item.tiers.map((tier) => ({ minQuantity: num(tier.minQuantity), price: num(tier.price) })),
        },
      ]),
    ),
  };
}

export type ResolvedPrice = { price: number; source: "catalogue" | "list" | "tier" };

/** What one line costs. `cataloguePrice` is what the item sells for before any list applies. */
export function resolveListPrice(context: PriceContext | null, variantId: string, quantity: number, cataloguePrice: number): ResolvedPrice {
  const rule = context?.rules.get(variantId);
  if (!rule) return { price: round2(cataloguePrice), source: "catalogue" };

  // Tiers first: the last one the quantity reaches is the one the customer has earned.
  const reached = rule.tiers.filter((tier) => quantity >= tier.minQuantity);
  if (reached.length > 0) {
    return { price: round2(reached[reached.length - 1].price), source: "tier" };
  }
  if (rule.price !== null) return { price: round2(rule.price), source: "list" };
  if (rule.discountPercent > 0) {
    return { price: round2(cataloguePrice * (1 - Math.min(100, rule.discountPercent) / 100)), source: "list" };
  }
  return { price: round2(cataloguePrice), source: "catalogue" };
}

/**
 * Checks a price list entry before it is saved: tiers that climb in quantity, no two tiers at the
 * same quantity, and an entry that actually prices something.
 */
export function assertPriceEntrySensible(entry: { price: number | null; discountPercent: number; tiers: { minQuantity: number; price: number }[] }) {
  if (entry.price === null && entry.discountPercent === 0 && entry.tiers.length === 0) {
    throw new BusinessError("Set a price, a discount, or at least one quantity break — otherwise the entry does nothing.");
  }
  const quantities = entry.tiers.map((tier) => tier.minQuantity);
  if (new Set(quantities).size !== quantities.length) {
    throw new BusinessError("Two quantity breaks start at the same quantity. Use one break per quantity.");
  }
  for (const tier of entry.tiers) {
    if (tier.minQuantity <= 1) throw new BusinessError("A quantity break has to start above 1 — below that, the list price applies.");
    if (tier.price < 0) throw new BusinessError("A quantity break cannot be a negative price.");
  }

  // Buying more should not cost more per unit: that is a mistake nobody means to make.
  const sorted = [...entry.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].price > sorted[i - 1].price) {
      throw new BusinessError(`Buying ${sorted[i].minQuantity} costs more each than buying ${sorted[i - 1].minQuantity}. Check the breaks.`);
    }
  }
}

/** Exactly one list may be the default, like the default branch. */
export async function clearOtherDefaults(tx: Tx, keepId: string) {
  await tx.priceList.updateMany({ where: { id: { not: keepId }, isDefault: true }, data: { isDefault: false } });
}
