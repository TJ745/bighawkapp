"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizePosCapability } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { recordAudit } from "@/lib/platform/audit";
import { itemModifierGroupsSchema, modifierGroupSchema } from "@/lib/validation/modifiers";

/**
 * Modifier groups. Behind the MODIFIERS capability, so a retail branch never reaches them even
 * with the POS module on and Inventory rights — the chain is module → capability → permission.
 */

function revalidateModifiers(itemId?: string) {
  revalidatePath("/pos/modifiers");
  revalidatePath("/pos/register");
  revalidatePath("/pos/products");
  if (itemId) revalidatePath(`/pos/products/${itemId}/edit`);
}

export async function createModifierGroup(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("MODIFIERS", "INVENTORY", "create");
    const data = parseInput(modifierGroupSchema, input);
    const clash = await db.modifierGroup.findFirst({ where: { name: data.name }, select: { id: true } });
    if (clash) throw new BusinessError("A modifier group with this name already exists.");

    const group = await db.modifierGroup.create({
      data: {
        name: data.name,
        prompt: data.prompt,
        minSelect: data.minSelect,
        maxSelect: data.maxSelect,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
        options: {
          create: data.options.map((option, index) => ({
            name: option.name,
            priceDelta: option.priceDelta,
            isDefault: option.isDefault,
            isActive: option.isActive,
            sortOrder: index,
          })),
        },
      },
    });

    await recordAudit({ auth, action: "modifier_group.created", entity: "ModifierGroup", entityId: group.id, summary: `Modifier group ${group.name} created` });
    revalidateModifiers();
    return { id: group.id };
  });
}

export async function updateModifierGroup(groupId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("MODIFIERS", "INVENTORY", "edit");
    const data = parseInput(modifierGroupSchema, input);
    const current = await db.modifierGroup.findUnique({ where: { id: groupId }, include: { options: { select: { id: true } } } });
    if (!current) throw new BusinessError("Modifier group not found.");
    const clash = await db.modifierGroup.findFirst({ where: { name: data.name }, select: { id: true } });
    if (clash && clash.id !== groupId) throw new BusinessError("A modifier group with this name already exists.");

    await db.modifierGroup.update({
      where: { id: groupId },
      data: {
        name: data.name,
        prompt: data.prompt,
        minSelect: data.minSelect,
        maxSelect: data.maxSelect,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      },
    });

    // Options are reconciled, never replaced: a sold line points at the option it was charged for.
    const keptIds = data.options.map((option) => option.id).filter((id): id is string => Boolean(id));
    for (const [index, option] of data.options.entries()) {
      const row = {
        name: option.name,
        priceDelta: option.priceDelta,
        isDefault: option.isDefault,
        isActive: option.isActive,
        sortOrder: index,
      };
      if (option.id && current.options.some((existing) => existing.id === option.id)) {
        await db.modifierOption.update({ where: { id: option.id }, data: row });
      } else {
        await db.modifierOption.create({ data: { ...row, groupId } });
      }
    }
    for (const option of current.options.filter((existing) => !keptIds.includes(existing.id))) {
      const sold = await db.posSaleItemModifier.count({ where: { optionId: option.id } });
      // An option that has been sold is deactivated; deleting it would orphan a receipt line.
      if (sold > 0) await db.modifierOption.update({ where: { id: option.id }, data: { isActive: false } });
      else await db.modifierOption.delete({ where: { id: option.id } });
    }

    await recordAudit({ auth, action: "modifier_group.updated", entity: "ModifierGroup", entityId: groupId, summary: `Modifier group ${data.name} updated` });
    revalidateModifiers();
  });
}

export async function setModifierGroupActive(groupId: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("MODIFIERS", "INVENTORY", "edit");
    const group = await db.modifierGroup.findUnique({ where: { id: groupId }, select: { name: true } });
    if (!group) throw new BusinessError("Modifier group not found.");
    await db.modifierGroup.update({ where: { id: groupId }, data: { isActive } });
    await recordAudit({
      auth,
      action: isActive ? "modifier_group.activated" : "modifier_group.deactivated",
      entity: "ModifierGroup",
      entityId: groupId,
      summary: `Modifier group ${group.name} ${isActive ? "activated" : "deactivated"}`,
    });
    revalidateModifiers();
  });
}

/** Attaches groups to an item, in the order given. */
export async function setItemModifierGroups(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("MODIFIERS", "INVENTORY", "edit");
    const data = parseInput(itemModifierGroupsSchema, input);
    const item = await db.item.findUnique({ where: { id: data.itemId }, select: { id: true, name: true } });
    if (!item) throw new BusinessError("Item not found.");
    if (data.groupIds.length > 0) {
      const found = await db.modifierGroup.count({ where: { id: { in: data.groupIds } } });
      if (found !== new Set(data.groupIds).size) throw new BusinessError("One of the modifier groups no longer exists.");
    }

    await db.$transaction(async (tx) => {
      await tx.itemModifierGroup.deleteMany({ where: { itemId: data.itemId } });
      for (const [index, groupId] of data.groupIds.entries()) {
        await tx.itemModifierGroup.create({ data: { itemId: data.itemId, groupId, sortOrder: index } });
      }
    });

    await recordAudit({
      auth,
      action: "item.modifiers_set",
      entity: "Item",
      entityId: data.itemId,
      summary: `${item.name}: ${data.groupIds.length === 0 ? "no modifier groups" : `${data.groupIds.length} modifier group(s)`}`,
    });
    revalidateModifiers(data.itemId);
  });
}
