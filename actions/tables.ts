"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizeModule, authorizePosCapability } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { completeParkedSale, createSale, getOpenShift, updateParkedSale } from "@/lib/business/pos";
import { assertTableFree, mergeOrders, splitOrder, transferOrder } from "@/lib/business/pos-tables";
import { getCurrentBranch } from "@/lib/data/platform";
import { today } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";
import { recordAudit } from "@/lib/platform/audit";
import { posTypeHasCapability } from "@/lib/platform/pos-types";
import { mergeOrdersSchema, payOrderSchema, saveOrderSchema, splitOrderSchema, tableSchema, transferOrderSchema } from "@/lib/validation/tables";

/**
 * Dine-in table service.
 *
 * Every action goes through `authorizePosCapability("TABLES", …)`: POS module on, this branch's
 * industry serves tables, and the user holds the permission — in that order.
 */

function revalidateTables() {
  revalidatePath("/pos/tables");
  revalidatePath("/pos/register");
  revalidatePath("/pos/sales");
  revalidatePath("/finance/income");
  revalidatePath("/dashboard");
}

// --- Taking orders -----------------------------------------------------------

/**
 * Opens a bill — on a table, or as a named bar tab — or replaces what is on the one already open.
 * Prices, VAT and modifier deltas are resolved server-side either way.
 *
 * The capability checked follows what is being saved: a tab needs TABS, a table needs TABLES. A
 * pub with no floor plan therefore gets tabs without tables, and a restaurant the other way round.
 */
export async function saveOrder(input: unknown): Promise<ActionResult<{ id: string; number: string; grandTotal: number }>> {
  return runAction(async () => {
    const data = parseInput(saveOrderSchema, input);
    const auth = await authorizePosCapability(data.tabName && !data.tableId ? "TABS" : "TABLES", "POS_ORDERS", "create");
    const [branch, settings] = await Promise.all([getCurrentBranch(), getAppSettings()]);
    if (branch.posConfig && !branch.posConfig.isActive) throw new BusinessError("POS is switched off for this branch.");
    if (!data.saleId && !data.tableId && !data.tabName) throw new BusinessError("Choose a table, or give the tab a name.");

    if (data.saleId) {
      const result = await updateParkedSale({
        saleId: data.saleId,
        branchId: branch.id,
        lines: data.lines,
        // The discount travels on each line, so an order never carries a cart-wide figure.
        cartDiscountPercent: 0,
        customerId: data.customerId,
        note: data.note,
        guestCount: data.guestCount,
        tabName: data.tabName,
        vatEnabled: settings.vatEnabled,
        defaultVatRate: settings.defaultVatRate,
      });
      await recordAudit({
        auth,
        action: "pos.order_updated",
        entity: "PosSale",
        entityId: result.id,
        branchId: branch.id,
        summary: `Order ${result.number} updated to ${result.totals.grandTotal}`,
        metadata: { lines: data.lines.length, total: result.totals.grandTotal },
      });
      revalidateTables();
      return { id: result.id, number: result.number, grandTotal: result.totals.grandTotal };
    }

    // A tab has no table; a dine-in order needs one that is free.
    const table = data.tableId ? await assertTableFree(data.tableId, branch.id) : null;
    const todayDate = await today();
    const result = await createSale({
      branchId: branch.id,
      registerId: null,
      shiftId: null,
      customerId: data.customerId,
      tableId: table?.id ?? null,
      tabName: table ? null : data.tabName,
      guestCount: data.guestCount,
      cartDiscountPercent: 0,
      note: data.note,
      lines: data.lines,
      payments: [],
      park: true,
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
      vatEnabled: settings.vatEnabled,
      defaultVatRate: settings.defaultVatRate,
    });
    await recordAudit({
      auth,
      action: "pos.order_opened",
      entity: "PosSale",
      entityId: result.id,
      branchId: branch.id,
      summary: `Order ${result.number} opened on ${table ? table.name : `tab ${data.tabName}`}`,
      metadata: { table: table?.name ?? null, tab: data.tabName, total: result.totals.grandTotal, guests: data.guestCount },
    });
    revalidateTables();
    return { id: result.id, number: result.number, grandTotal: result.totals.grandTotal };
  });
}

/** Settles the bill on a table, keeping the number the order has been running under. */
export async function payOrder(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string; changeDue: number; grandTotal: number; orderNumber: number | null }>> {
  return runAction(async () => {
    await authorizeModule("POS", "POS", "create");
    const data = parseInput(payOrderSchema, input);
    // Which capability applies depends on what kind of bill this is, so the bill is read first.
    const sale = await db.posSale.findUnique({ where: { id: data.saleId }, select: { tableId: true } });
    const auth = await authorizePosCapability(sale && sale.tableId === null ? "TABS" : "TABLES", "POS_ORDERS", "create");
    const [branch, todayDate] = await Promise.all([getCurrentBranch(), today()]);
    const shift = data.registerId ? await getOpenShift(data.registerId) : null;

    const result = await completeParkedSale({
      saleId: data.saleId,
      branchId: branch.id,
      registerId: data.registerId,
      shiftId: shift?.id ?? null,
      payments: data.payments,
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
      withOrderNumber: posTypeHasCapability(branch.posConfig?.businessType ?? "RETAIL", "QUICK_ORDER"),
    });

    await recordAudit({
      auth,
      action: "pos.order_paid",
      entity: "PosSale",
      entityId: result.id,
      branchId: branch.id,
      summary: `Order ${result.number} paid, ${result.totals.grandTotal}`,
      metadata: { total: result.totals.grandTotal, change: result.changeDue },
    });
    revalidateTables();
    return { id: result.id, number: result.number, changeDue: result.changeDue, grandTotal: result.totals.grandTotal, orderNumber: result.orderNumber };
  });
}

// --- Moving orders around ----------------------------------------------------

export async function moveOrder(input: unknown): Promise<ActionResult<{ number: string; to: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("TABLES", "POS_ORDERS", "edit");
    const data = parseInput(transferOrderSchema, input);
    const branch = await getCurrentBranch();
    const result = await transferOrder({ saleId: data.saleId, tableId: data.tableId, branchId: branch.id });
    await recordAudit({
      auth,
      action: "pos.order_transferred",
      entity: "PosSale",
      entityId: data.saleId,
      branchId: branch.id,
      summary: `Order ${result.number} moved from ${result.from ?? "no table"} to ${result.to}`,
    });
    revalidateTables();
    return { number: result.number, to: result.to };
  });
}

export async function joinOrders(input: unknown): Promise<ActionResult<{ number: string; grandTotal: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("TABLES", "POS_ORDERS", "edit");
    const data = parseInput(mergeOrdersSchema, input);
    const branch = await getCurrentBranch();
    const result = await mergeOrders({ sourceId: data.sourceId, targetId: data.targetId, branchId: branch.id });
    await recordAudit({
      auth,
      action: "pos.orders_merged",
      entity: "PosSale",
      entityId: data.targetId,
      branchId: branch.id,
      summary: `Order ${result.mergedNumber} merged into ${result.number} (${result.grandTotal})`,
      metadata: { from: result.from, to: result.to, total: result.grandTotal },
    });
    revalidateTables();
    return { number: result.number, grandTotal: result.grandTotal };
  });
}

export async function divideOrder(input: unknown): Promise<ActionResult<{ splitNumber: string; splitTotal: number; originalTotal: number }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("TABLES", "POS_ORDERS", "edit");
    const data = parseInput(splitOrderSchema, input);
    const [branch, todayDate] = await Promise.all([getCurrentBranch(), today()]);
    const result = await splitOrder({
      saleId: data.saleId,
      lines: data.lines,
      branchId: branch.id,
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
    });
    await recordAudit({
      auth,
      action: "pos.order_split",
      entity: "PosSale",
      entityId: result.splitId,
      branchId: branch.id,
      summary: `Order ${result.number} split: ${result.splitNumber} for ${result.splitTotal}`,
      metadata: { original: result.originalTotal, split: result.splitTotal },
    });
    revalidateTables();
    return { splitNumber: result.splitNumber, splitTotal: result.splitTotal, originalTotal: result.originalTotal };
  });
}

// --- The floor plan itself (manager territory, like registers) ----------------

export async function createTable(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("TABLES", "INVENTORY", "create");
    const data = parseInput(tableSchema, formDataToObject(formData));
    const branch = await getCurrentBranch();
    const clash = await db.posTable.findFirst({ where: { branchId: branch.id, name: data.name }, select: { id: true } });
    if (clash) throw new BusinessError("A table with this name already exists at this branch.");

    const table = await db.posTable.create({ data: { ...data, branchId: branch.id } });
    await recordAudit({ auth, action: "pos.table_created", entity: "PosTable", entityId: table.id, branchId: branch.id, summary: `Table ${table.name} added` });
    revalidatePath("/pos/tables/setup");
    revalidateTables();
    return { id: table.id };
  });
}

export async function updateTable(tableId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("TABLES", "INVENTORY", "edit");
    const data = parseInput(tableSchema, formDataToObject(formData));
    const branch = await getCurrentBranch();
    const table = await db.posTable.findUnique({ where: { id: tableId }, select: { id: true, branchId: true } });
    if (!table || table.branchId !== branch.id) throw new BusinessError("That table is not at this branch.");
    const clash = await db.posTable.findFirst({ where: { branchId: table.branchId, name: data.name, id: { not: tableId } }, select: { id: true } });
    if (clash) throw new BusinessError("A table with this name already exists at this branch.");
    if (!data.isActive) {
      const open = await db.posSale.findFirst({ where: { tableId, status: "PARKED" }, select: { number: true } });
      if (open) throw new BusinessError(`Settle or move order ${open.number} before taking this table out of use.`);
    }

    await db.posTable.update({ where: { id: tableId }, data });
    await recordAudit({ auth, action: "pos.table_updated", entity: "PosTable", entityId: tableId, branchId: branch.id, summary: `Table ${data.name} updated` });
    revalidatePath("/pos/tables/setup");
    revalidateTables();
  });
}
