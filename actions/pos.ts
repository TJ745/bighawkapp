"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizeModule } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import {
  closeShift as closeShiftEngine,
  createSale,
  discardParkedSale,
  getOpenShift,
  getShiftSummary,
  openShift as openShiftEngine,
  recordCashMovement,
  resumeParkedSale,
  voidSale as voidSaleEngine,
  type ShiftSummary,
} from "@/lib/business/pos";
import { sendToKitchen } from "@/lib/business/pos-kitchen";
import { createReturn, getReturnableLines, quoteReturn, type ReturnableLine } from "@/lib/business/pos-returns";
import { getCurrentBranch } from "@/lib/data/platform";
import { listParkedSales, type ParkedSale } from "@/lib/data/pos";
import { today } from "@/lib/data/sales";
import { getAppSettings } from "@/lib/data/settings";
import { recordAudit } from "@/lib/platform/audit";
import { posTypeHasCapability } from "@/lib/platform/pos-types";
import { cashMovementSchema, closeShiftSchema, createReturnSchema, createSaleSchema, openShiftSchema, registerSchema, voidSaleSchema } from "@/lib/validation/pos";

function revalidatePos() {
  revalidatePath("/pos/register");
  revalidatePath("/pos/sales");
  revalidatePath("/pos/shifts");
  revalidatePath("/pos/stock");
  // POS takings are income, so the finance screens change too.
  revalidatePath("/finance/income");
  revalidatePath("/dashboard");
}

// --- Selling -----------------------------------------------------------------

/** Rings up a sale, or holds it. Needs the POS module and the till permission. */
export async function completeSale(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string; changeDue: number; status: string; kitchenError: string | null; orderNumber: number | null }>> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "POS", "create");
    const data = parseInput(createSaleSchema, input);
    const [branch, settings, todayDate] = await Promise.all([getCurrentBranch(), getAppSettings(), today()]);
    if (!branch) throw new BusinessError("No branch is available to sell from.");
    if (branch.posConfig && !branch.posConfig.isActive) throw new BusinessError("POS is switched off for this branch.");

    // A sale belongs to the open shift at its register, when there is one.
    const shift = data.registerId ? await getOpenShift(data.registerId) : null;

    const posType = branch.posConfig?.businessType ?? "RETAIL";
    const result = await createSale({
      branchId: branch.id,
      registerId: data.registerId,
      shiftId: shift?.id ?? null,
      customerId: data.customerId,
      cartDiscountPercent: data.cartDiscountPercent,
      note: data.note,
      lines: data.lines,
      payments: data.payments,
      park: data.park,
      // Quick service calls numbers out, so a completed counter sale takes one for the day.
      withOrderNumber: !data.park && posTypeHasCapability(posType, "QUICK_ORDER"),
      cashier: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
      vatEnabled: settings.vatEnabled,
      defaultVatRate: settings.defaultVatRate,
    });

    /**
     * A counter kitchen (quick service, cafe) has no floor plan to send rounds from, so a
     * completed sale goes through by itself. The sale is already recorded: a kitchen ticket that
     * fails to write must not undo it, so the cashier is told and the money stands.
     */
    let kitchenError: string | null = null;
    if (!data.park && posTypeHasCapability(posType, "KITCHEN") && !posTypeHasCapability(posType, "TABLES")) {
      try {
        await sendToKitchen({ saleId: result.id, branchId: branch.id, user: { id: auth.user.id, name: auth.user.name } });
      } catch (error) {
        kitchenError = error instanceof BusinessError ? error.message : "The kitchen was not told about this order.";
      }
    }

    await recordAudit({
      auth,
      action: data.park ? "pos.sale_held" : "pos.sale_completed",
      entity: "PosSale",
      entityId: result.id,
      branchId: branch.id,
      summary: data.park ? `Sale ${result.number} held` : `Sale ${result.number} for ${result.totals.grandTotal}`,
      metadata: { total: result.totals.grandTotal, lines: data.lines.length },
    });
    revalidatePos();
    revalidatePath("/pos/kitchen");
    return { id: result.id, number: result.number, changeDue: result.changeDue, status: result.status, kitchenError, orderNumber: result.orderNumber };
  });
}

/** Picks a held sale back up at the till. */
export async function resumeSale(saleId: string): Promise<ActionResult<ParkedSale>> {
  return runAction(async () => {
    await authorizeModule("POS", "POS", "create");
    const sale = await resumeParkedSale(saleId);
    const branch = await getCurrentBranch();
    const parked = (await listParkedSales(branch.id)).find((p) => p.id === sale.id);
    if (!parked) throw new BusinessError("That held sale is not available at this branch.");
    return parked;
  });
}

export async function discardSale(saleId: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "POS", "create");
    const result = await discardParkedSale(saleId);
    await recordAudit({ auth, action: "pos.sale_discarded", entity: "PosSale", entityId: saleId, summary: `Held sale ${result.number} discarded` });
    revalidatePos();
  });
}

/** Voiding reverses stock and money, so it needs more than the right to sell. */
export async function voidSale(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "POS", "delete");
    const data = parseInput(voidSaleSchema, input);
    const result = await voidSaleEngine({ saleId: data.saleId, reason: data.reason, user: { id: auth.user.id, name: auth.user.name } });
    await recordAudit({
      auth,
      action: "pos.sale_voided",
      entity: "PosSale",
      entityId: data.saleId,
      summary: `Sale ${result.number} voided — ${data.reason}`,
    });
    revalidatePos();
  });
}

// --- Returns & refunds -------------------------------------------------------

/** What is still returnable on a sale, priced — drives the return dialog. */
export async function getReturnable(saleId: string): Promise<ActionResult<ReturnableLine[]>> {
  return runAction(async () => {
    await authorizeModule("POS", "POS", "view");
    return getReturnableLines(saleId);
  });
}

/** Prices a proposed return before it is committed, so the cashier sees the exact refund. */
export async function quoteReturnAmount(saleId: string, lines: unknown): Promise<ActionResult<{ grandTotal: number; vatTotal: number; subtotal: number }>> {
  return runAction(async () => {
    await authorizeModule("POS", "POS", "view");
    const parsed = parseInput(createReturnSchema.pick({ lines: true }), { lines });
    const quote = await quoteReturn(saleId, parsed.lines);
    return { grandTotal: quote.grandTotal, vatTotal: quote.vatTotal, subtotal: quote.subtotal };
  });
}

/**
 * Takes goods back and refunds them. Needs POS *edit*: a cashier handles returns, but someone with
 * view-only rights cannot move money.
 */
export async function recordReturn(input: unknown): Promise<ActionResult<{ id: string; number: string; grandTotal: number; fully: boolean }>> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "POS", "edit");
    const data = parseInput(createReturnSchema, input);
    const [branch, todayDate] = await Promise.all([getCurrentBranch(), today()]);
    const shift = data.registerId ? await getOpenShift(data.registerId) : null;

    const result = await createReturn({
      saleId: data.saleId,
      lines: data.lines,
      refunds: data.refunds,
      reason: data.reason,
      restock: data.restock,
      registerId: data.registerId,
      shiftId: shift?.id ?? null,
      user: { id: auth.user.id, name: auth.user.name },
      today: todayDate,
    });

    await recordAudit({
      auth,
      action: "pos.return_recorded",
      entity: "PosReturn",
      entityId: result.id,
      branchId: branch.id,
      summary: `Return ${result.number} against ${result.saleNumber} for ${result.grandTotal}${data.restock ? "" : " (not restocked)"}`,
      metadata: { refund: result.grandTotal, restock: data.restock, fully: result.fully },
    });
    revalidatePos();
    revalidatePath("/pos/returns");
    return { id: result.id, number: result.number, grandTotal: result.grandTotal, fully: result.fully };
  });
}

// --- Shifts ------------------------------------------------------------------

export async function openShift(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "POS", "create");
    const data = parseInput(openShiftSchema, input);
    const branch = await getCurrentBranch();
    const register = await db.posRegister.findUnique({ where: { id: data.registerId }, select: { id: true, name: true, branchId: true, isActive: true } });
    if (!register || register.branchId !== branch.id) throw new BusinessError("That register is not at this branch.");
    if (!register.isActive) throw new BusinessError("That register is not in use.");

    const shift = await openShiftEngine({
      registerId: register.id,
      branchId: branch.id,
      openingCash: data.openingCash,
      user: { id: auth.user.id, name: auth.user.name },
    });
    await recordAudit({
      auth,
      action: "pos.shift_opened",
      entity: "PosShift",
      entityId: shift.id,
      branchId: branch.id,
      summary: `${register.name} opened with ${data.openingCash} float`,
    });
    revalidatePos();
    return { id: shift.id };
  });
}

export async function closeShift(input: unknown): Promise<ActionResult<{ expectedCash: number; countedCash: number; variance: number }>> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "POS", "create");
    const data = parseInput(closeShiftSchema, input);
    const result = await closeShiftEngine({
      shiftId: data.shiftId,
      countedCash: data.countedCash,
      note: data.note,
      user: { id: auth.user.id, name: auth.user.name },
    });
    await recordAudit({
      auth,
      action: "pos.shift_closed",
      entity: "PosShift",
      entityId: data.shiftId,
      summary: `Shift closed: expected ${result.expectedCash}, counted ${result.countedCash}, variance ${result.variance}`,
      metadata: { expected: result.expectedCash, counted: result.countedCash, variance: result.variance },
    });
    revalidatePos();
    return { expectedCash: result.expectedCash, countedCash: result.countedCash, variance: result.variance };
  });
}

export async function addCashMovement(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "POS", "create");
    const data = parseInput(cashMovementSchema, input);
    await recordCashMovement({
      shiftId: data.shiftId,
      kind: data.kind,
      amount: data.amount,
      reason: data.reason,
      user: { id: auth.user.id, name: auth.user.name },
    });
    await recordAudit({
      auth,
      action: data.kind === "CASH_IN" ? "pos.cash_in" : "pos.cash_out",
      entity: "PosShift",
      entityId: data.shiftId,
      summary: `${data.kind === "CASH_IN" ? "Cash in" : "Cash out"} ${data.amount} — ${data.reason}`,
    });
    revalidatePos();
  });
}

/** Live drawer figures for the close-shift dialog. */
export async function getShiftTotals(shiftId: string): Promise<ActionResult<ShiftSummary>> {
  return runAction(async () => {
    await authorizeModule("POS", "POS", "view");
    return getShiftSummary(shiftId);
  });
}

// --- Registers (Inventory/manager territory, not the cashier's) ---------------

export async function createRegister(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "INVENTORY", "create");
    const data = parseInput(registerSchema, formDataToObject(formData));
    const branch = await getCurrentBranch();
    const clash = await db.posRegister.findFirst({ where: { branchId: branch.id, name: data.name }, select: { id: true } });
    if (clash) throw new BusinessError("A register with this name already exists at this branch.");

    const register = await db.posRegister.create({ data: { ...data, branchId: branch.id } });
    await recordAudit({ auth, action: "pos.register_created", entity: "PosRegister", entityId: register.id, branchId: branch.id, summary: `Register ${register.name} added` });
    revalidatePath("/pos/registers");
    revalidatePos();
    return { id: register.id };
  });
}

export async function updateRegister(registerId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "INVENTORY", "edit");
    const data = parseInput(registerSchema, formDataToObject(formData));
    const register = await db.posRegister.findUnique({ where: { id: registerId }, select: { id: true, branchId: true } });
    if (!register) throw new BusinessError("Register not found.");
    const clash = await db.posRegister.findFirst({ where: { branchId: register.branchId, name: data.name, id: { not: registerId } }, select: { id: true } });
    if (clash) throw new BusinessError("A register with this name already exists at this branch.");
    if (!data.isActive) {
      const open = await getOpenShift(registerId);
      if (open) throw new BusinessError("Close the open shift before taking this register out of use.");
    }

    await db.posRegister.update({ where: { id: registerId }, data });
    await recordAudit({ auth, action: "pos.register_updated", entity: "PosRegister", entityId: registerId, summary: `Register ${data.name} updated` });
    revalidatePath("/pos/registers");
    revalidatePos();
  });
}
