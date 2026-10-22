"use server";

import { revalidatePath } from "next/cache";
import { BusinessError } from "@/lib/auth/errors";
import { authorizeModule, type AuthContext } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { cancelReceipt, getReceivableLines, receiveGoods, type ReceivableLine } from "@/lib/business/receiving";
import { recordAudit } from "@/lib/platform/audit";
import { cancelReceiptSchema, receiveGoodsSchema } from "@/lib/validation/receiving";

/**
 * Receiving goods against a purchase.
 *
 * The feature belongs to Procurement — it is a purchase being fulfilled — but it writes stock, and
 * stock belongs to POS. So it needs **both**: the right to edit purchases, and the POS module with
 * the right to maintain inventory. A company running Business Management alone keeps its purchases
 * and simply has no shelf to put them on, and is told so in those words.
 */
async function authorizeReceiving(action: "edit" | "delete" = "edit"): Promise<AuthContext> {
  const auth = await authorizeModule("BUSINESS_MANAGEMENT", "PROCUREMENT", action);
  if (!auth.hasModule("POS")) {
    throw new BusinessError("Stock levels come with the POS module, which is not enabled for your company.");
  }
  if (!auth.can("INVENTORY", action)) {
    throw new BusinessError("You need permission to maintain inventory to receive goods into stock.");
  }
  return auth;
}

function revalidateReceiving(purchaseId: string) {
  revalidatePath(`/procurement/purchases/${purchaseId}`);
  revalidatePath("/procurement/purchases");
  // Stock changed, so the inventory screens change with it.
  revalidatePath("/pos/stock");
  revalidatePath("/pos/products");
  revalidatePath("/pos/register");
}

/** What is still to arrive on a purchase — drives the receive dialog. */
export async function getReceivable(purchaseId: string): Promise<ActionResult<ReceivableLine[]>> {
  return runAction(async () => {
    await authorizeModule("BUSINESS_MANAGEMENT", "PROCUREMENT", "view");
    return getReceivableLines(purchaseId);
  });
}

/** Books a delivery in: stock arrives, and the purchase becomes received. */
export async function receiveDelivery(
  input: unknown,
): Promise<ActionResult<{ number: string; lines: number; stockLines: number; branchName: string; status: string }>> {
  return runAction(async () => {
    const auth = await authorizeReceiving("edit");
    const data = parseInput(receiveGoodsSchema, input);

    const result = await receiveGoods({
      purchaseId: data.purchaseId,
      branchId: data.branchId,
      date: data.date,
      lines: data.lines,
      note: data.note,
      updateCostPrice: data.updateCostPrice,
      user: { id: auth.user.id, name: auth.user.name },
    });

    await recordAudit({
      auth,
      action: "procurement.goods_received",
      entity: "PurchaseReceipt",
      entityId: result.id,
      branchId: data.branchId,
      summary: `${result.number}: ${result.stockLines} of ${result.lines} lines into stock at ${result.branchName} against ${result.purchaseNumber}`,
      metadata: { purchase: result.purchaseNumber, lines: result.lines, intoStock: result.stockLines, costPriceUpdated: data.updateCostPrice },
    });
    revalidateReceiving(data.purchaseId);
    return { number: result.number, lines: result.lines, stockLines: result.stockLines, branchName: result.branchName, status: result.status };
  });
}

/** Withdraws a receipt keyed in error: the stock comes back off the shelf, the record stays. */
export async function withdrawReceipt(input: unknown): Promise<ActionResult<{ number: string; purchaseNumber: string }>> {
  return runAction(async () => {
    // Taking stock back off a shelf is the heavier right, like voiding a sale.
    const auth = await authorizeReceiving("delete");
    const data = parseInput(cancelReceiptSchema, input);
    const result = await cancelReceipt({ receiptId: data.receiptId, reason: data.reason, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "procurement.goods_receipt_cancelled",
      entity: "PurchaseReceipt",
      entityId: data.receiptId,
      summary: `${result.number} against ${result.purchaseNumber} cancelled — ${data.reason}`,
    });
    revalidatePath("/procurement/purchases");
    revalidatePath("/pos/stock");
    return { number: result.number, purchaseNumber: result.purchaseNumber };
  });
}
