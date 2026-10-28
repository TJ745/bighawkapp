import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { round2 } from "@/lib/business/totals";
import { round3 } from "@/lib/business/inventory";
import type { DateRange } from "@/lib/validation/finance";
import { dateWhere } from "@/lib/business/finance";

/**
 * What actually sold.
 *
 * The till recorded every line; nothing grouped them. "Which lines make us money" is a different
 * question from "how much did we take", and only one of them tells a shopkeeper what to reorder
 * or stop stocking.
 *
 * Figures are **net of returns and excluding VAT**, because that is what the business keeps.
 * Quantity sold is what left the shop less what came back, and margin uses the **cost snapshotted
 * on the line**, never today's cost — the price of a tin changes, what that sale earned does not.
 */

export type SoldLine = {
  key: string;
  name: string;
  categoryName: string | null;
  quantity: number;
  /** Sales excluding VAT, after discounts, after returns. */
  net: number;
  cost: number;
  profit: number;
  /** Profit as a share of net sales. Null when nothing was sold, rather than a misleading 0%. */
  marginPercent: number | null;
};

/** Everything sold in a period, grouped by item and by category. */
export async function getSalesByItem(range: DateRange, branchId: string | null) {
  const lines = await db.posSaleItem.findMany({
    where: {
      sale: {
        date: dateWhere(range),
        // A void never happened and a held bill has not been paid for.
        status: { notIn: ["VOIDED", "PARKED"] },
        ...(branchId ? { branchId } : {}),
      },
    },
    select: {
      name: true,
      quantity: true,
      returnedQuantity: true,
      unitCost: true,
      lineSubtotal: true,
      lineDiscount: true,
      variant: { select: { item: { select: { category: { select: { name: true } } } } } },
    },
  });

  const byItem = new Map<string, SoldLine>();
  const byCategory = new Map<string, SoldLine>();

  for (const line of lines) {
    const sold = num(line.quantity);
    const returned = num(line.returnedQuantity);
    const kept = round3(sold - returned);
    if (kept <= 0 && returned === 0) continue;

    /**
     * The line's net is its subtotal less its discount — VAT excluded. Returns are taken off in
     * proportion rather than recomputed, because a part-returned line keeps the price it was
     * actually sold at, discount and all.
     */
    const lineNet = round2(num(line.lineSubtotal) - num(line.lineDiscount));
    const keptShare = sold > 0 ? kept / sold : 0;
    const net = round2(lineNet * keptShare);
    const cost = round2(num(line.unitCost) * kept);
    const categoryName = line.variant?.item.category?.name ?? null;

    add(byItem, line.name, line.name, categoryName, kept, net, cost);
    add(byCategory, categoryName ?? "Uncategorised", categoryName ?? "Uncategorised", null, kept, net, cost);
  }

  return { items: finish(byItem), categories: finish(byCategory) };
}

function add(
  map: Map<string, SoldLine>,
  key: string,
  name: string,
  categoryName: string | null,
  quantity: number,
  net: number,
  cost: number,
) {
  const entry = map.get(key) ?? { key, name, categoryName, quantity: 0, net: 0, cost: 0, profit: 0, marginPercent: null };
  entry.quantity = round3(entry.quantity + quantity);
  entry.net = round2(entry.net + net);
  entry.cost = round2(entry.cost + cost);
  map.set(key, entry);
}

/** Works out profit and margin once, at the end, so rounding happens in one place. */
function finish(map: Map<string, SoldLine>): SoldLine[] {
  return [...map.values()]
    .map((entry) => ({
      ...entry,
      profit: round2(entry.net - entry.cost),
      // Null rather than 0 when nothing was sold: "0% margin" is a claim, "—" is the truth.
      marginPercent: entry.net > 0 ? round2(((entry.net - entry.cost) / entry.net) * 100) : null,
    }))
    .sort((a, b) => b.net - a.net);
}
