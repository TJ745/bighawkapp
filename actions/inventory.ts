"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizeModule } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { adjustStock, setStockLevel, transferStock } from "@/lib/business/inventory";
import { assertBranchAllowed, getCurrentBranch, listTransferDestinations } from "@/lib/data/platform";
import { recordAudit } from "@/lib/platform/audit";
import { listStockMovements, type StockMovementRow } from "@/lib/data/items";
import { stockAdjustmentSchema, stockTransferSchema } from "@/lib/validation/items";

function revalidateStock() {
  revalidatePath("/pos/stock");
  revalidatePath("/pos/products");
}

async function describeVariant(variantId: string) {
  const variant = await db.itemVariant.findUnique({
    where: { id: variantId },
    select: { name: true, item: { select: { name: true, unit: true } } },
  });
  if (!variant) throw new BusinessError("Product not found.");
  const label = variant.name && variant.name !== variant.item.name ? `${variant.item.name} (${variant.name})` : variant.item.name;
  return { label, unit: variant.item.unit };
}

/**
 * Manual stock change — a count or a delta. The engine in lib/business/inventory.ts does the work;
 * this action only authorises, validates and records why it happened.
 */
export async function recordStockAdjustment(input: unknown): Promise<ActionResult<{ balance: number }>> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "INVENTORY", "edit");
    const data = parseInput(stockAdjustmentSchema, input);

    // A branch id arrives in a request, so it is checked against who is asking, not against a list.
    const branch = await assertBranchAllowed(data.branchId);
    const { label, unit } = await describeVariant(data.variantId);

    let balance: number;
    let summary: string;
    if (data.mode === "count") {
      const result = await setStockLevel({
        variantId: data.variantId,
        branchId: data.branchId,
        countedQuantity: data.countedQuantity!,
        note: data.note,
        userId: auth.user.id,
        userName: auth.user.name,
      });
      balance = result.balance;
      summary = `${label} counted at ${result.balance} ${unit} in ${branch.name}${result.changed ? ` (${result.delta > 0 ? "+" : ""}${result.delta})` : " (no change)"}`;
    } else {
      const movement = await adjustStock({
        variantId: data.variantId,
        branchId: data.branchId,
        delta: data.delta!,
        kind: data.kind,
        note: data.note,
        userId: auth.user.id,
        userName: auth.user.name,
      });
      balance = Number(movement?.balanceAfter ?? 0);
      summary = `${label} ${data.delta! > 0 ? "increased" : "reduced"} by ${Math.abs(data.delta!)} ${unit} in ${branch.name}`;
    }

    await recordAudit({ auth, action: "stock.adjusted", entity: "ItemVariant", entityId: data.variantId, branchId: data.branchId, summary, metadata: { mode: data.mode } });
    revalidateStock();
    return { balance };
  });
}

/** Moves stock between two branches as one transaction. */
export async function recordStockTransfer(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeModule("POS", "INVENTORY", "edit");
    const data = parseInput(stockTransferSchema, input);
    /**
     * Stock leaves a branch this person works at and may arrive anywhere active: sending goods to
     * a shop you do not staff is ordinary, taking them out of one you do not staff is not.
     */
    const from = await assertBranchAllowed(data.fromBranchId);
    const to = (await listTransferDestinations()).find((b) => b.id === data.toBranchId);
    if (!to) throw new BusinessError("Choose an active branch to send the stock to.");
    const { label, unit } = await describeVariant(data.variantId);

    await transferStock({
      variantId: data.variantId,
      fromBranchId: data.fromBranchId,
      toBranchId: data.toBranchId,
      quantity: data.quantity,
      note: data.note,
      userId: auth.user.id,
      userName: auth.user.name,
    });

    await recordAudit({
      auth,
      action: "stock.transferred",
      entity: "ItemVariant",
      entityId: data.variantId,
      branchId: data.fromBranchId,
      summary: `${data.quantity} ${unit} of ${label} moved from ${from.name} to ${to.name}`,
    });
    revalidateStock();
  });
}

/** Movement history for one variant at the branch in use, for the drawer on the stock screen. */
export async function getStockHistory(variantId: string): Promise<ActionResult<StockMovementRow[]>> {
  return runAction(async () => {
    await authorizeModule("POS", "INVENTORY", "view");
    const branch = await getCurrentBranch();
    return listStockMovements(variantId, branch.id);
  });
}
