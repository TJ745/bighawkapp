"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { applyAdvance, cancelAdvance, refundAdvance, takeAdvance, unapplyAdvance } from "@/lib/business/advances";
import { recordAudit } from "@/lib/platform/audit";
import {
  applyAdvanceSchema,
  cancelAdvanceSchema,
  refundAdvanceSchema,
  takeAdvanceSchema,
  unapplyAdvanceSchema,
} from "@/lib/validation/advances";

/**
 * Customer advances.
 *
 * Permission is `SALES`, the same as recording a payment on an invoice — this is the same job done
 * before the invoice exists. Taking money and giving it back are `edit`; cancelling a record is
 * `delete`, because it withdraws something that was already written down.
 */

function revalidateAdvances(customerId?: string, invoiceId?: string) {
  revalidatePath("/customers");
  if (customerId) revalidatePath(`/customers/${customerId}`);
  if (invoiceId) revalidatePath(`/sales/invoices/${invoiceId}`);
  revalidatePath("/sales/invoices");
  // Money in and account balances both read these rows.
  revalidatePath("/finance", "layout");
  revalidatePath("/dashboard");
}

export async function recordAdvance(input: unknown): Promise<ActionResult<{ number: string; amount: number }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "edit");
    const data = parseInput(takeAdvanceSchema, input);
    const result = await takeAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "sales.advance_taken",
      entity: "CustomerAdvance",
      entityId: result.id,
      summary: `${result.number}: ${result.amount} received from ${result.customerName} in advance`,
      metadata: { amount: result.amount, date: data.date },
    });
    revalidateAdvances(data.customerId);
    return { number: result.number, amount: result.amount };
  });
}

export async function settleInvoiceFromAdvance(input: unknown): Promise<ActionResult<{ advanceNumber: string; invoiceNumber: string; amount: number; remaining: number }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "edit");
    const data = parseInput(applyAdvanceSchema, input);
    const result = await applyAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "sales.advance_applied",
      entity: "CustomerAdvance",
      entityId: data.advanceId,
      summary: `${result.amount} of ${result.advanceNumber} settled ${result.invoiceNumber}`,
      metadata: { amount: result.amount, invoiceStatus: result.invoice.status, remainingOnAdvance: result.remaining },
    });
    revalidateAdvances(undefined, data.invoiceId);
    return { advanceNumber: result.advanceNumber, invoiceNumber: result.invoiceNumber, amount: result.amount, remaining: result.remaining };
  });
}

export async function returnAdvanceToBalance(input: unknown): Promise<ActionResult<{ advanceNumber: string; invoiceNumber: string; amount: number }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "edit");
    const data = parseInput(unapplyAdvanceSchema, input);
    const result = await unapplyAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "sales.advance_unapplied",
      entity: "CustomerAdvance",
      entityId: data.paymentId,
      summary: `${result.amount} taken back off ${result.invoiceNumber} and returned to ${result.advanceNumber}`,
      metadata: { amount: result.amount, invoiceStatus: result.invoice.status },
    });
    revalidateAdvances();
    return { advanceNumber: result.advanceNumber, invoiceNumber: result.invoiceNumber, amount: result.amount };
  });
}

export async function giveBackAdvance(input: unknown): Promise<ActionResult<{ number: string; amount: number; remaining: number }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "edit");
    const data = parseInput(refundAdvanceSchema, input);
    const result = await refundAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "sales.advance_refunded",
      entity: "CustomerAdvance",
      entityId: data.advanceId,
      summary: `${result.amount} of ${result.number} given back to the customer`,
      metadata: { amount: result.amount, remaining: result.remaining, date: data.date },
    });
    revalidateAdvances();
    return { number: result.number, amount: result.amount, remaining: result.remaining };
  });
}

export async function withdrawAdvance(input: unknown): Promise<ActionResult<{ number: string }>> {
  return runAction(async () => {
    // Withdrawing a record of money received is the heavier right, like voiding a sale.
    const auth = await authorize("SALES", "delete");
    const data = parseInput(cancelAdvanceSchema, input);
    const result = await cancelAdvance({ ...data, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "sales.advance_cancelled",
      entity: "CustomerAdvance",
      entityId: data.advanceId,
      summary: `${result.number} (${result.amount}) cancelled — ${data.reason}`,
    });
    revalidateAdvances();
    return { number: result.number };
  });
}
