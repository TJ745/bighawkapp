"use server";

import { revalidatePath } from "next/cache";
import { authorizeModule, type AuthContext } from "@/lib/auth/session";
import { assertBranchAllowed } from "@/lib/data/platform";
import { BusinessError } from "@/lib/auth/errors";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { cancelPurchaseReturn, createPurchaseReturn, getReturnableLines, quotePurchaseReturn } from "@/lib/business/purchase-returns";
import { recordAudit } from "@/lib/platform/audit";
import { cancelPurchaseReturnSchema, createPurchaseReturnSchema } from "@/lib/validation/purchase-returns";

/**
 * Returning goods to a supplier.
 *
 * Needs **both modules**, exactly as receiving does and for the same reason: the paperwork is
 * Procurement's, but the shelf the goods come off belongs to POS. A Business-Management-only
 * company is told plainly that there is no shelf, rather than silently writing a credit with no
 * stock behind it.
 */
async function authorizeReturns(action: "edit" | "delete" = "edit"): Promise<AuthContext> {
  const auth = await authorizeModule("BUSINESS_MANAGEMENT", "PROCUREMENT", action);
  if (!auth.hasModule("POS")) {
    throw new BusinessError("Stock levels come with the POS module, which is not enabled for your company.");
  }
  if (!auth.can("INVENTORY", action)) {
    throw new BusinessError("You need permission to maintain inventory to send goods back off a shelf.");
  }
  return auth;
}

function revalidateReturns(purchaseId: string) {
  revalidatePath(`/procurement/purchases/${purchaseId}`);
  revalidatePath("/procurement/purchases");
  // Stock changed, so the inventory screens change with it.
  revalidatePath("/pos/stock");
  revalidatePath("/pos/products");
  // And what is owed, which payables and the dashboard both read.
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
}

/** What can still go back on a purchase, for the dialog to offer. */
export async function listReturnableLines(purchaseId: string): Promise<ActionResult<Awaited<ReturnType<typeof getReturnableLines>>>> {
  return runAction(async () => {
    await authorizeReturns("edit");
    return getReturnableLines(purchaseId);
  });
}

/** Prices a proposed return, so the dialog shows the same figures that will be written. */
export async function previewPurchaseReturn(
  purchaseId: string,
  lines: { purchaseItemId: string; quantity: number }[],
): Promise<ActionResult<Awaited<ReturnType<typeof quotePurchaseReturn>>>> {
  return runAction(async () => {
    await authorizeReturns("edit");
    return quotePurchaseReturn(purchaseId, lines);
  });
}

export async function sendGoodsBack(input: unknown): Promise<ActionResult<{ id: string; number: string; grandTotal: number; refunded: number }>> {
  return runAction(async () => {
    const auth = await authorizeReturns("edit");
    const data = parseInput(createPurchaseReturnSchema, input);
    // Narrowing the branch picker is never the check: the branch arrives from the client.
    await assertBranchAllowed(data.branchId);

    const result = await createPurchaseReturn({
      purchaseId: data.purchaseId,
      branchId: data.branchId,
      lines: data.lines,
      reason: data.reason,
      date: data.date,
      internalNotes: data.internalNotes,
      refund: data.refund,
      user: { id: auth.user.id, name: auth.user.name },
    });

    await recordAudit({
      auth,
      action: "procurement.goods_returned",
      entity: "PurchaseReturn",
      entityId: result.id,
      summary: `${result.number}: ${result.grandTotal} of goods sent back — ${data.reason}`,
      metadata: { grandTotal: result.grandTotal, refunded: result.refunded, purchaseStatus: result.purchase.status },
    });
    revalidateReturns(data.purchaseId);
    return { id: result.id, number: result.number, grandTotal: result.grandTotal, refunded: result.refunded };
  });
}

export async function withdrawPurchaseReturn(input: unknown): Promise<ActionResult<{ number: string; purchaseNumber: string }>> {
  return runAction(async () => {
    // Putting stock back and undoing a credit is the heavier right, like cancelling a receipt.
    const auth = await authorizeReturns("delete");
    const data = parseInput(cancelPurchaseReturnSchema, input);
    const result = await cancelPurchaseReturn({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "procurement.return_cancelled",
      entity: "PurchaseReturn",
      entityId: data.returnId,
      summary: `${result.number} cancelled — ${data.reason}`,
      metadata: { purchaseStatus: result.purchase.status },
    });
    revalidateReturns(result.purchaseId);
    return { number: result.number, purchaseNumber: result.purchaseNumber };
  });
}
