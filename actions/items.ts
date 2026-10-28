"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizeModule } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getCurrentBranch } from "@/lib/data/platform";
import { posTypeHasCapability, posTypeLabel } from "@/lib/platform/pos-types";
import { applyStockMovement } from "@/lib/business/inventory";
import { recordAudit } from "@/lib/platform/audit";
import { deleteStoredFile, fileFromFormData, IMAGE_TYPES, MAX_IMAGE_BYTES, storeFile } from "@/lib/storage";
import { itemCategorySchema, itemSchema, type ItemValues } from "@/lib/validation/items";

const IMAGE_FOLDER = "items";

function revalidateCatalogue(itemId?: string) {
  revalidatePath("/pos/products");
  revalidatePath("/pos/stock");
  if (itemId) revalidatePath(`/pos/products/${itemId}/edit`);
}

/** Catalogue work needs the POS module and the Inventory permission — not the till permission. */
function authorizeCatalogue(action: "create" | "edit" | "view" | "delete") {
  return authorizeModule("POS", "INVENTORY", action);
}

/**
 * A size/colour matrix belongs to industries that sell the same thing in several forms.
 *
 * The form hides the matrix elsewhere, but hiding is never the check — so the rule lives here too.
 * An item that **already** has several variants keeps them and stays editable, because a branch
 * switching industry must not strip data nobody can then reach; what is refused is *adding* to it.
 */
async function assertVariantsAllowed(wanted: number, existing: number) {
  if (wanted <= 1 || wanted <= existing) return;
  const branch = await getCurrentBranch();
  const posType = branch.posConfig?.businessType ?? "RETAIL";
  if (posTypeHasCapability(posType, "VARIANTS")) return;
  throw new BusinessError(
    `${posTypeLabel(posType)} sells each item in one form, so variants are not available. Create a separate item for each form instead.`,
  );
}

// --- Categories --------------------------------------------------------------

export async function createItemCategory(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizeCatalogue("create");
    const data = parseInput(itemCategorySchema, input);
    const existing = await db.itemCategory.findFirst({ where: { name: data.name }, select: { id: true } });
    if (existing) throw new BusinessError("A category with this name already exists.");

    const category = await db.itemCategory.create({ data });
    await recordAudit({ auth, action: "category.created", entity: "ItemCategory", entityId: category.id, summary: `Category ${category.name} created` });
    revalidatePath("/pos/categories");
    revalidateCatalogue();
    return { id: category.id };
  });
}

export async function updateItemCategory(categoryId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeCatalogue("edit");
    const data = parseInput(itemCategorySchema, input);
    const current = await db.itemCategory.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!current) throw new BusinessError("Category not found.");
    const clash = await db.itemCategory.findFirst({ where: { name: data.name }, select: { id: true } });
    if (clash && clash.id !== categoryId) throw new BusinessError("A category with this name already exists.");

    await db.itemCategory.update({ where: { id: categoryId }, data });
    await recordAudit({ auth, action: "category.updated", entity: "ItemCategory", entityId: categoryId, summary: `Category ${data.name} updated` });
    revalidatePath("/pos/categories");
    revalidateCatalogue();
  });
}

// --- Items -------------------------------------------------------------------

/**
 * Variant rows are reconciled rather than replaced: a variant that already carries stock and
 * movements must keep its id, so deleting and recreating is not an option. Variants dropped from
 * the form are deactivated when they have history and removed only when they are untouched.
 */
async function saveVariants(itemId: string, input: ItemValues) {
  const existing = await db.itemVariant.findMany({ where: { itemId }, select: { id: true } });
  const keptIds = input.variants.map((v) => v.id).filter((id): id is string => Boolean(id));

  for (const [index, variant] of input.variants.entries()) {
    const data = {
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      plu: variant.plu,
      attributes: variant.attributes ?? undefined,
      salePrice: variant.salePrice,
      costPrice: variant.costPrice,
      minStock: variant.minStock,
      reorderLevel: variant.reorderLevel,
      isActive: variant.isActive,
      isDefault: index === 0 && input.variants.length === 1,
      sortOrder: index,
    };
    if (variant.id && existing.some((e) => e.id === variant.id)) {
      await db.itemVariant.update({ where: { id: variant.id }, data });
    } else {
      await db.itemVariant.create({ data: { ...data, itemId } });
    }
  }

  const removed = existing.filter((e) => !keptIds.includes(e.id));
  for (const variant of removed) {
    const [movements, levels] = await Promise.all([
      db.stockMovement.count({ where: { variantId: variant.id } }),
      db.stockLevel.count({ where: { variantId: variant.id, quantity: { not: 0 } } }),
    ]);
    if (movements > 0 || levels > 0) {
      await db.itemVariant.update({ where: { id: variant.id }, data: { isActive: false } });
    } else {
      await db.itemVariant.delete({ where: { id: variant.id } });
    }
  }
}

/** The Item columns, taken from validated input — variants are saved by saveVariants(). */
function itemRow(input: ItemValues) {
  return {
    kind: input.kind,
    name: input.name,
    code: input.code,
    categoryId: input.categoryId,
    brand: input.brand,
    description: input.description,
    unit: input.unit,
    salePrice: input.salePrice,
    costPrice: input.costPrice,
    vatRate: input.vatRate,
    trackStock: input.trackStock,
    durationMinutes: input.durationMinutes,
    isActive: input.isActive,
  };
}

function parseItemForm(formData: FormData) {
  const raw = formDataToObject(formData);
  // Variants and the booleans arrive as JSON so the matrix survives the FormData round trip.
  const variants = typeof raw.variants === "string" ? JSON.parse(raw.variants) : [];
  return parseInput(itemSchema, {
    ...raw,
    variants,
    trackStock: raw.trackStock === "true",
    isActive: raw.isActive === "true",
  });
}

export async function createItem(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizeCatalogue("create");
    const input = parseItemForm(formData);
    // A brand-new item has nothing to keep, so anything beyond one variant is an addition.
    await assertVariantsAllowed(input.variants.length, 0);
    if (input.code) {
      const clash = await db.item.findFirst({ where: { code: input.code }, select: { id: true } });
      if (clash) throw new BusinessError("An item with this code already exists.");
    }

    const image = fileFromFormData(formData, "image");
    const stored = image ? await storeFile(image, IMAGE_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;

    const item = await db.item.create({
      data: {
        ...itemRow(input),
        imageKey: stored?.key ?? null,
        imageUrl: stored?.url ?? null,
        createdById: auth.user.id,
      },
    });
    await saveVariants(item.id, input);

    // Opening stock, if any was entered, goes through the inventory engine like every other change.
    const openingRaw = formData.get("openingStock");
    const opening = typeof openingRaw === "string" ? Number(openingRaw) : 0;
    if (item.trackStock && Number.isFinite(opening) && opening > 0) {
      const branch = await getCurrentBranch();
      const first = await db.itemVariant.findFirst({ where: { itemId: item.id }, orderBy: { sortOrder: "asc" }, select: { id: true } });
      if (branch && first) {
        await db.$transaction((tx) =>
          applyStockMovement(tx, {
            variantId: first.id,
            branchId: branch.id,
            kind: "OPENING",
            quantity: opening,
            unitCost: input.costPrice,
            referenceType: "OPENING",
            note: "Opening stock",
            userId: auth.user.id,
            userName: auth.user.name,
          }),
        );
      }
    }

    await recordAudit({ auth, action: "item.created", entity: "Item", entityId: item.id, summary: `${input.kind === "SERVICE" ? "Service" : "Product"} ${item.name} created` });
    revalidateCatalogue(item.id);
    return { id: item.id };
  });
}

export async function updateItem(itemId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeCatalogue("edit");
    const input = parseItemForm(formData);
    const current = await db.item.findUnique({ where: { id: itemId }, select: { id: true, imageKey: true, code: true } });
    if (!current) throw new BusinessError("Item not found.");
    await assertVariantsAllowed(input.variants.length, await db.itemVariant.count({ where: { itemId } }));
    if (input.code && input.code !== current.code) {
      const clash = await db.item.findFirst({ where: { code: input.code }, select: { id: true } });
      if (clash && clash.id !== itemId) throw new BusinessError("An item with this code already exists.");
    }

    const image = fileFromFormData(formData, "image");
    const removeImage = formData.get("removeImage") === "true";
    const stored = image ? await storeFile(image, IMAGE_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;

    await db.item.update({
      where: { id: itemId },
      data: {
        ...itemRow(input),
        ...(stored ? { imageKey: stored.key, imageUrl: stored.url } : removeImage ? { imageKey: null, imageUrl: null } : {}),
      },
    });
    await saveVariants(itemId, input);

    if ((stored || removeImage) && current.imageKey) await deleteStoredFile(current.imageKey);

    await recordAudit({ auth, action: "item.updated", entity: "Item", entityId: itemId, summary: `${input.name} updated` });
    revalidateCatalogue(itemId);
  });
}

/** Items are catalogue data, not financial records, so deactivating is the right exit. */
export async function setItemActive(itemId: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeCatalogue("edit");
    const item = await db.item.findUnique({ where: { id: itemId }, select: { name: true } });
    if (!item) throw new BusinessError("Item not found.");

    await db.item.update({ where: { id: itemId }, data: { isActive } });
    await recordAudit({
      auth,
      action: isActive ? "item.activated" : "item.deactivated",
      entity: "Item",
      entityId: itemId,
      summary: `${item.name} ${isActive ? "activated" : "deactivated"}`,
    });
    revalidateCatalogue(itemId);
  });
}
