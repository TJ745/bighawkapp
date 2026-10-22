"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizePosCapability } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { assertPriceEntrySensible, clearOtherDefaults, getPriceContext, resolveListPrice } from "@/lib/business/pricing";
import { num } from "@/lib/decimal";
import { getCurrentBranch } from "@/lib/data/platform";
import { recordAudit } from "@/lib/platform/audit";
import { priceEntrySchema, priceListSchema, quotePricesSchema, setCustomerListSchema } from "@/lib/validation/pricing";

/**
 * Price lists. Maintaining them is `INVENTORY` work, like the catalogue prices they replace.
 *
 * Nothing here decides a price at the till: the till asks `quotePrices` what to *show*, and the
 * sale engine resolves the price again when the sale is recorded. The screen is never the authority.
 */

function revalidatePricing() {
  revalidatePath("/pos/price-lists");
  revalidatePath("/pos/register");
}

// --- The lists ----------------------------------------------------------------

export async function createPriceList(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("PRICE_LISTS", "INVENTORY", "create");
    const data = parseInput(priceListSchema, Object.fromEntries(formData));
    const branch = await getCurrentBranch();

    const clash = await db.priceList.findFirst({ where: { name: data.name }, select: { id: true } });
    if (clash) throw new BusinessError("A price list with this name already exists.");

    const list = await db.$transaction(async (tx) => {
      const created = await tx.priceList.create({ data, select: { id: true } });
      // Exactly one list is the default, like the default branch.
      if (data.isDefault) await clearOtherDefaults(tx, created.id);
      return created;
    });

    await recordAudit({
      auth,
      action: "pos.price_list_created",
      entity: "PriceList",
      entityId: list.id,
      branchId: branch.id,
      summary: `Price list ${data.name}${data.isDefault ? " (default)" : ""}`,
    });
    revalidatePricing();
    return { id: list.id };
  });
}

export async function updatePriceList(listId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("PRICE_LISTS", "INVENTORY", "edit");
    const data = parseInput(priceListSchema, Object.fromEntries(formData));
    const branch = await getCurrentBranch();

    const list = await db.priceList.findUnique({ where: { id: listId }, select: { id: true } });
    if (!list) throw new BusinessError("That price list no longer exists.");
    const clash = await db.priceList.findFirst({ where: { name: data.name, id: { not: listId } }, select: { id: true } });
    if (clash) throw new BusinessError("A price list with this name already exists.");

    await db.$transaction(async (tx) => {
      await tx.priceList.update({ where: { id: listId }, data });
      if (data.isDefault) await clearOtherDefaults(tx, listId);
    });

    await recordAudit({
      auth,
      action: "pos.price_list_updated",
      entity: "PriceList",
      entityId: listId,
      branchId: branch.id,
      summary: `Price list ${data.name} updated${data.isActive ? "" : " and taken out of use"}`,
    });
    revalidatePricing();
  });
}

// --- What is on a list --------------------------------------------------------

/** Saves one item's pricing on one list, quantity breaks and all. Empty removes the entry. */
export async function savePriceEntry(input: unknown): Promise<ActionResult<{ removed: boolean }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("PRICE_LISTS", "INVENTORY", "edit");
    const data = parseInput(priceEntrySchema, input);
    const branch = await getCurrentBranch();

    const list = await db.priceList.findUnique({ where: { id: data.listId }, select: { id: true, name: true } });
    if (!list) throw new BusinessError("That price list no longer exists.");
    const variant = await db.itemVariant.findUnique({ where: { id: data.variantId }, select: { id: true, item: { select: { name: true } } } });
    if (!variant) throw new BusinessError("That product no longer exists.");

    const empty = data.price === null && data.discountPercent === 0 && data.tiers.length === 0;
    if (empty) {
      await db.priceListItem.deleteMany({ where: { listId: data.listId, variantId: data.variantId } });
      await recordAudit({
        auth,
        action: "pos.price_entry_removed",
        entity: "PriceList",
        entityId: data.listId,
        branchId: branch.id,
        summary: `${variant.item.name} removed from ${list.name}`,
      });
      revalidatePricing();
      return { removed: true };
    }

    assertPriceEntrySensible(data);

    await db.$transaction(async (tx) => {
      const existing = await tx.priceListItem.findFirst({ where: { listId: data.listId, variantId: data.variantId }, select: { id: true } });
      const entry = existing
        ? await tx.priceListItem.update({
            where: { id: existing.id },
            data: { price: data.price, discountPercent: data.discountPercent },
            select: { id: true },
          })
        : await tx.priceListItem.create({
            data: { listId: data.listId, variantId: data.variantId, price: data.price, discountPercent: data.discountPercent },
            select: { id: true },
          });
      // The breaks are replaced wholesale, so the rows always match what was on screen.
      await tx.priceTier.deleteMany({ where: { priceListItemId: entry.id } });
      if (data.tiers.length > 0) {
        await tx.priceTier.createMany({
          data: data.tiers.map((tier) => ({ priceListItemId: entry.id, minQuantity: tier.minQuantity, price: tier.price })),
        });
      }
    });

    await recordAudit({
      auth,
      action: "pos.price_entry_saved",
      entity: "PriceList",
      entityId: data.listId,
      branchId: branch.id,
      summary: `${variant.item.name} on ${list.name}: ${data.price === null ? `${data.discountPercent}% off` : data.price}${data.tiers.length > 0 ? `, ${data.tiers.length} breaks` : ""}`,
    });
    revalidatePricing();
    return { removed: false };
  });
}

/** Puts a customer on a list, or back on the default. */
export async function setCustomerPriceList(input: unknown): Promise<ActionResult<{ customerName: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("PRICE_LISTS", "INVENTORY", "edit");
    const data = parseInput(setCustomerListSchema, input);
    const branch = await getCurrentBranch();

    const customer = await db.customer.findUnique({ where: { id: data.customerId }, select: { id: true, name: true } });
    if (!customer) throw new BusinessError("That customer no longer exists.");
    if (data.listId) {
      const list = await db.priceList.findUnique({ where: { id: data.listId }, select: { id: true, isActive: true, name: true } });
      if (!list) throw new BusinessError("That price list no longer exists.");
      if (!list.isActive) throw new BusinessError(`${list.name} is not in use.`);
    }

    await db.customer.update({ where: { id: customer.id }, data: { priceListId: data.listId } });
    await recordAudit({
      auth,
      action: "pos.customer_price_list",
      entity: "Customer",
      entityId: customer.id,
      branchId: branch.id,
      summary: data.listId ? `${customer.name} moved onto a price list` : `${customer.name} back on the default prices`,
    });
    revalidatePricing();
    return { customerName: customer.name };
  });
}

/**
 * What the till should *show* for these lines and this customer. The sale engine resolves the same
 * prices again when the sale is recorded, so this is a display aid, never the authority.
 */
export async function quotePrices(input: unknown): Promise<ActionResult<{ listName: string | null; lines: { variantId: string; price: number; source: string }[] }>> {
  return runAction(async () => {
    await authorizePosCapability("PRICE_LISTS", "POS", "view");
    const data = parseInput(quotePricesSchema, input);

    const context = await getPriceContext(data.customerId);
    const variants = await db.itemVariant.findMany({
      where: { id: { in: data.lines.map((line) => line.variantId) } },
      select: { id: true, salePrice: true, item: { select: { salePrice: true } } },
    });

    return {
      listName: context ? context.listName : null,
      lines: data.lines.map((line) => {
        const variant = variants.find((v) => v.id === line.variantId);
        const catalogue = variant ? (variant.salePrice === null ? num(variant.item.salePrice) : num(variant.salePrice)) : 0;
        const resolved = resolveListPrice(context, line.variantId, line.quantity, catalogue);
        return { variantId: line.variantId, price: resolved.price, source: resolved.source };
      }),
    };
  });
}
