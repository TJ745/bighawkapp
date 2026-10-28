"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import {
  applySupplierAdvance,
  cancelSupplierAdvance,
  paySupplierAdvance,
  refundSupplierAdvance,
  unapplySupplierAdvance,
} from "@/lib/business/supplier-advances";
import { recordAudit } from "@/lib/platform/audit";
import {
  applySupplierAdvanceSchema,
  cancelSupplierAdvanceSchema,
  paySupplierAdvanceSchema,
  refundSupplierAdvanceSchema,
  unapplySupplierAdvanceSchema,
} from "@/lib/validation/supplier-advances";

/**
 * Supplier prepayments.
 *
 * Permission is `PROCUREMENT`, the same as recording a payment on a purchase — this is the same
 * job done before the bill exists. Paying and taking money back are `edit`; cancelling a record is
 * `delete`, because it withdraws something that was already written down.
 */

function revalidatePrepayments(supplierId?: string, purchaseId?: string) {
  revalidatePath("/procurement/suppliers");
  if (supplierId) revalidatePath(`/procurement/suppliers/${supplierId}`);
  if (purchaseId) revalidatePath(`/procurement/purchases/${purchaseId}`);
  revalidatePath("/procurement/purchases");
  // Money out and account balances both read these rows.
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
}

export async function recordSupplierPrepayment(input: unknown): Promise<ActionResult<{ number: string; amount: number }>> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "edit");
    const data = parseInput(paySupplierAdvanceSchema, input);
    const result = await paySupplierAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "procurement.prepayment_made",
      entity: "SupplierAdvance",
      entityId: result.id,
      summary: `${result.number}: ${result.amount} paid to ${result.supplierName} in advance`,
      metadata: { amount: result.amount, date: data.date },
    });
    revalidatePrepayments(data.supplierId);
    return { number: result.number, amount: result.amount };
  });
}

export async function settlePurchaseFromPrepayment(
  input: unknown,
): Promise<ActionResult<{ advanceNumber: string; purchaseNumber: string; amount: number; remaining: number }>> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "edit");
    const data = parseInput(applySupplierAdvanceSchema, input);
    const result = await applySupplierAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "procurement.prepayment_applied",
      entity: "SupplierAdvance",
      entityId: data.advanceId,
      summary: `${result.amount} of ${result.advanceNumber} settled ${result.purchaseNumber}`,
      metadata: { amount: result.amount, purchaseStatus: result.purchase.status, remainingOnPrepayment: result.remaining },
    });
    revalidatePrepayments(undefined, data.purchaseId);
    return { advanceNumber: result.advanceNumber, purchaseNumber: result.purchaseNumber, amount: result.amount, remaining: result.remaining };
  });
}

export async function returnPrepaymentToBalance(
  input: unknown,
): Promise<ActionResult<{ advanceNumber: string; purchaseNumber: string; amount: number }>> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "edit");
    const data = parseInput(unapplySupplierAdvanceSchema, input);
    const result = await unapplySupplierAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "procurement.prepayment_unapplied",
      entity: "SupplierAdvance",
      entityId: data.paymentId,
      summary: `${result.amount} taken back off ${result.purchaseNumber} and returned to ${result.advanceNumber}`,
      metadata: { amount: result.amount, purchaseStatus: result.purchase.status },
    });
    revalidatePrepayments();
    return { advanceNumber: result.advanceNumber, purchaseNumber: result.purchaseNumber, amount: result.amount };
  });
}

export async function recordPrepaymentReturned(input: unknown): Promise<ActionResult<{ number: string; amount: number; remaining: number }>> {
  return runAction(async () => {
    const auth = await authorize("PROCUREMENT", "edit");
    const data = parseInput(refundSupplierAdvanceSchema, input);
    const result = await refundSupplierAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "procurement.prepayment_returned",
      entity: "SupplierAdvance",
      entityId: data.advanceId,
      summary: `${result.amount} of ${result.number} came back from the supplier`,
      metadata: { amount: result.amount, remaining: result.remaining, date: data.date },
    });
    revalidatePrepayments();
    return { number: result.number, amount: result.amount, remaining: result.remaining };
  });
}

export async function withdrawSupplierPrepayment(input: unknown): Promise<ActionResult<{ number: string }>> {
  return runAction(async () => {
    // Withdrawing a record of money paid is the heavier right, like voiding a sale.
    const auth = await authorize("PROCUREMENT", "delete");
    const data = parseInput(cancelSupplierAdvanceSchema, input);
    const result = await cancelSupplierAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "procurement.prepayment_cancelled",
      entity: "SupplierAdvance",
      entityId: data.advanceId,
      summary: `${result.number} (${result.amount}) cancelled — ${data.reason}`,
    });
    revalidatePrepayments();
    return { number: result.number };
  });
}
