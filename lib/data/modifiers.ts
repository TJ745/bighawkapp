import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";

/** Modifier groups and what each item asks about. */

export async function listModifierGroups(options?: { activeOnly?: boolean }) {
  const rows = await db.modifierGroup.findMany({
    where: options?.activeOnly ? { isActive: true } : undefined,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      _count: { select: { items: true } },
    },
  });
  return rows.map((group) => ({
    id: group.id,
    name: group.name,
    prompt: group.prompt,
    minSelect: group.minSelect,
    maxSelect: group.maxSelect,
    sortOrder: group.sortOrder,
    isActive: group.isActive,
    itemCount: group._count.items,
    options: group.options.map((option) => ({
      id: option.id,
      name: option.name,
      priceDelta: num(option.priceDelta),
      isDefault: option.isDefault,
      isActive: option.isActive,
    })),
  }));
}

export type ModifierGroupRow = Awaited<ReturnType<typeof listModifierGroups>>[number];

export async function getItemModifierGroupIds(itemId: string) {
  const rows = await db.itemModifierGroup.findMany({ where: { itemId }, orderBy: { sortOrder: "asc" }, select: { groupId: true } });
  return rows.map((row) => row.groupId);
}

/**
 * The groups the register needs, keyed by item, with defaults pre-marked. Only active groups and
 * options are sent: a withdrawn option must not be orderable even though old receipts still name it.
 */
export async function listItemModifiers() {
  const rows = await db.itemModifierGroup.findMany({
    where: { group: { isActive: true } },
    orderBy: { sortOrder: "asc" },
    include: { group: { include: { options: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } } } },
  });

  const byItem = new Map<string, RegisterModifierGroup[]>();
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? [];
    list.push({
      id: row.group.id,
      name: row.group.name,
      prompt: row.group.prompt,
      minSelect: row.group.minSelect,
      maxSelect: row.group.maxSelect,
      options: row.group.options.map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: num(option.priceDelta),
        isDefault: option.isDefault,
      })),
    });
    byItem.set(row.itemId, list);
  }
  return Object.fromEntries(byItem);
}

export type RegisterModifierGroup = {
  id: string;
  name: string;
  prompt: string | null;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; priceDelta: number; isDefault: boolean }[];
};

export type ItemModifierMap = Record<string, RegisterModifierGroup[]>;
