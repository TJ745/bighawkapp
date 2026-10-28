import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { ItemKind } from "@/lib/generated/prisma/enums";
import { getStockLevels, round3 } from "@/lib/business/inventory";
import { num } from "@/lib/decimal";
import { round2 } from "@/lib/business/totals";
import { paginate, type ListParams } from "@/lib/list-params";
import { allowedBranchIds } from "@/lib/auth/current-user";

/** Catalogue reads. Stock always comes from one branch — the one the user is working in. */

const FILTERS: Record<string, Prisma.ItemWhereInput> = {
  products: { kind: "PRODUCT" },
  services: { kind: "SERVICE" },
  active: { isActive: true },
  inactive: { isActive: false },
};

function itemWhere(params: ListParams, categoryId?: string): Prisma.ItemWhereInput {
  return {
    ...(FILTERS[params.filter] ?? {}),
    ...(categoryId ? { categoryId } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { code: { contains: params.q, mode: "insensitive" } },
            { brand: { contains: params.q, mode: "insensitive" } },
            { variants: { some: { sku: { contains: params.q, mode: "insensitive" } } } },
            { variants: { some: { barcode: { contains: params.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

/**
 * The catalogue, as the signed-in person is allowed to see it.
 *
 * Permissions say what somebody may do; `User.branchId` says where. A person pinned to one shop
 * is shown that shop's items and the ones sold everywhere — a salon manager has no use for a
 * page of mixed grills, and `allowedBranchIds()` already decides this everywhere else in the
 * app. A company admin is pinned to nothing and sees the lot, with the "Sold at" column to tell
 * them apart, because maintaining every shop's catalogue is their job.
 *
 * Combined with **AND**, not merged into the existing `where`: the search already puts an `OR`
 * on that object, and a second one would silently replace the first — a filter that returns the
 * wrong rows with nothing to show it went wrong.
 */
export async function listItems(params: ListParams, branchId: string, categoryId?: string) {
  const allowed = await allowedBranchIds();
  const base = itemWhere(params, categoryId);
  const where: Prisma.ItemWhereInput =
    allowed === null ? base : { AND: [base, { OR: [{ branchId: null }, { branchId: { in: allowed } }] }] };
  const [rows, total] = await Promise.all([
    db.item.findMany({
      where,
      orderBy: [{ name: "asc" }],
      ...paginate(params),
      include: {
        category: { select: { id: true, name: true } },
        // Null for almost everything, which the list reads as "every branch".
        branch: { select: { id: true, name: true } },
        variants: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      },
    }),
    db.item.count({ where }),
  ]);

  const stock = await getStockLevels(
    rows.flatMap((item) => (item.trackStock ? item.variants.map((v) => v.id) : [])),
    branchId,
  );

  const items = rows.map((item) => {
    const variants = item.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      salePrice: variant.salePrice === null ? num(item.salePrice) : num(variant.salePrice),
      minStock: num(variant.minStock),
      quantity: stock.get(variant.id) ?? 0,
    }));
    const totalStock = item.trackStock ? round3(variants.reduce((sum, v) => sum + v.quantity, 0)) : null;
    return {
      id: item.id,
      kind: item.kind,
      name: item.name,
      code: item.code,
      brand: item.brand,
      unit: item.unit,
      salePrice: num(item.salePrice),
      costPrice: num(item.costPrice),
      isActive: item.isActive,
      trackStock: item.trackStock,
      durationMinutes: item.durationMinutes,
      category: item.category,
      branch: item.branch,
      variants,
      variantCount: variants.length,
      totalStock,
      // "Low" is per variant, so one colour running out is visible on the item row.
      lowStock: item.trackStock && variants.some((v) => v.minStock > 0 && v.quantity <= v.minStock),
    };
  });

  return { items, total };
}

export type ItemListRow = Awaited<ReturnType<typeof listItems>>["items"][number];

export async function getItem(id: string) {
  const item = await db.item.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true } },
      variants: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
  });
  if (!item) return null;
  return {
    ...item,
    salePrice: num(item.salePrice),
    costPrice: num(item.costPrice),
    vatRate: item.vatRate === null ? null : num(item.vatRate),
    variants: item.variants.map((v) => ({
      ...v,
      salePrice: v.salePrice === null ? null : num(v.salePrice),
      costPrice: v.costPrice === null ? null : num(v.costPrice),
      minStock: num(v.minStock),
      reorderLevel: num(v.reorderLevel),
      attributes: (v.attributes as Record<string, string> | null) ?? null,
    })),
  };
}

export type ItemDetail = NonNullable<Awaited<ReturnType<typeof getItem>>>;

export async function listItemCategories(options?: { activeOnly?: boolean }) {
  const rows = await db.itemCategory.findMany({
    where: options?.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });
  return rows.map((row) => ({ ...row, itemCount: row._count.items }));
}

export type ItemCategoryRow = Awaited<ReturnType<typeof listItemCategories>>[number];

/** Stock screen: one row per variant at this branch, newest movement first for context. */
export async function listStock(params: ListParams, branchId: string) {
  const where: Prisma.ItemVariantWhereInput = {
    isActive: true,
    item: {
      trackStock: true,
      ...(params.filter === "inactive" ? { isActive: false } : params.filter === "all" ? {} : { isActive: true }),
      // Low stock is judged per branch below, so the query itself stays on active items.
      ...(params.q
        ? {
            OR: [
              { name: { contains: params.q, mode: "insensitive" } },
              { code: { contains: params.q, mode: "insensitive" } },
              { brand: { contains: params.q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
  };

  const [rows, total] = await Promise.all([
    db.itemVariant.findMany({
      where,
      orderBy: [{ item: { name: "asc" } }, { sortOrder: "asc" }],
      ...paginate(params),
      include: { item: { select: { id: true, name: true, unit: true, code: true, category: { select: { name: true } } } } },
    }),
    db.itemVariant.count({ where }),
  ]);

  const stock = await getStockLevels(
    rows.map((r) => r.id),
    branchId,
  );

  const mapped = rows.map((variant) => {
    const quantity = stock.get(variant.id) ?? 0;
    const minStock = num(variant.minStock);
    return {
      variantId: variant.id,
      itemId: variant.item.id,
      itemName: variant.item.name,
      variantName: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      unit: variant.item.unit,
      categoryName: variant.item.category?.name ?? null,
      quantity,
      minStock,
      reorderLevel: num(variant.reorderLevel),
      isLow: minStock > 0 && quantity <= minStock,
    };
  });

  const lowCount = mapped.filter((i) => i.isLow).length;
  const items = params.filter === "low" ? mapped.filter((i) => i.isLow) : mapped;
  return { items, total: params.filter === "low" ? items.length : total, lowCount };
}

export type StockRow = Awaited<ReturnType<typeof listStock>>["items"][number];

/** Movement history for one variant at one branch — the audit trail behind its quantity. */
export async function listStockMovements(variantId: string, branchId: string, limit = 50) {
  const rows = await db.stockMovement.findMany({
    where: { variantId, branchId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    quantity: num(row.quantity),
    balanceAfter: num(row.balanceAfter),
    reference: row.reference,
    referenceType: row.referenceType,
    note: row.note,
    userName: row.userName,
    createdAt: row.createdAt,
  }));
}

export type StockMovementRow = Awaited<ReturnType<typeof listStockMovements>>[number];

/** Options for pickers (POS register, purchase lines later). */
export async function listItemOptions(kind?: ItemKind) {
  return db.itemVariant.findMany({
    where: { isActive: true, item: { isActive: true, ...(kind ? { kind } : {}) } },
    orderBy: [{ item: { name: "asc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      name: true,
      sku: true,
      barcode: true,
      salePrice: true,
      item: { select: { id: true, name: true, kind: true, unit: true, salePrice: true, trackStock: true } },
    },
  });
}

/**
 * What the stock on hand is worth, at cost.
 *
 * Its own query rather than a total of the table above, because that table is paginated: summing
 * twenty-five rows and calling it the stock value would be wrong by everything on page two.
 *
 * Valued at **cost**, never at the sale price — this is what the business paid for what it is
 * holding, which is the figure an accountant asks for. The variant's own cost wins over the
 * item's, exactly as it does when a sale is priced, so a line's margin and this total agree.
 */
export async function getStockValuation(branchId: string) {
  const levels = await db.stockLevel.findMany({
    where: { branchId, quantity: { gt: 0 }, variant: { isActive: true, item: { trackStock: true, isActive: true } } },
    select: {
      quantity: true,
      variant: { select: { costPrice: true, item: { select: { costPrice: true } } } },
    },
  });

  let value = 0;
  let units = 0;
  for (const level of levels) {
    const quantity = num(level.quantity);
    const unitCost = level.variant.costPrice === null ? num(level.variant.item.costPrice) : num(level.variant.costPrice);
    value = round2(value + quantity * unitCost);
    units = round3(units + quantity);
  }
  // `lines` is how many different things are on the shelf; `units` is how much of them there is.
  return { value, units, lines: levels.length };
}

export type StockValuation = Awaited<ReturnType<typeof getStockValuation>>;
