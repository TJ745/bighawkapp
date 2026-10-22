"use server";

import { revalidatePath } from "next/cache";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { cancelCreditNote, createCreditNote, getCreditableLines, quoteCreditNote, type CreditableLine } from "@/lib/business/credit-notes";
import { recordAudit } from "@/lib/platform/audit";
import { cancelCreditNoteSchema, createCreditNoteSchema } from "@/lib/validation/credit-notes";

/**
 * Credit notes against issued invoices.
 *
 * Issuing one is `SALES` *edit* — the same right as recording a payment, because both move what a
 * customer owes. Cancelling one is `SALES` *delete*: it takes a credit (and possibly a refund) back
 * out, which is the same weight as voiding a POS sale.
 */

function revalidateCredits(invoiceId?: string) {
  revalidatePath("/sales/credit-notes");
  revalidatePath("/sales/invoices");
  if (invoiceId) revalidatePath(`/sales/invoices/${invoiceId}`);
  // A refund is money out, so the money screens change too.
  revalidatePath("/finance/income");
  revalidatePath("/finance/outstanding");
  revalidatePath("/dashboard");
}

/** What is still creditable on an invoice — drives the dialog. */
export async function getCreditable(invoiceId: string): Promise<ActionResult<CreditableLine[]>> {
  return runAction(async () => {
    await authorize("SALES", "view");
    return getCreditableLines(invoiceId);
  });
}

/** Prices a proposed credit note before it is issued, so the figures on screen are the real ones. */
export async function quoteCredit(
  invoiceId: string,
  lines: unknown,
  adjustments: unknown = [],
): Promise<ActionResult<{ subtotal: number; discountTotal: number; vatTotal: number; grandTotal: number }>> {
  return runAction(async () => {
    await authorize("SALES", "view");
    const parsed = parseInput(createCreditNoteSchema.pick({ lines: true, adjustments: true }), { lines, adjustments });
    const quote = await quoteCreditNote(invoiceId, parsed.lines, parsed.adjustments);
    return { subtotal: quote.subtotal, discountTotal: quote.discountTotal, vatTotal: quote.vatTotal, grandTotal: quote.grandTotal };
  });
}

export async function issueCreditNote(input: unknown): Promise<ActionResult<{ id: string; number: string; grandTotal: number; refunded: number }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "edit");
    const data = parseInput(createCreditNoteSchema, input);
    if (data.refundAmount > 0 && !data.refundAccountId) throw new BusinessError("Choose the account the refund comes from.");

    const result = await createCreditNote({
      invoiceId: data.invoiceId,
      lines: data.lines,
      adjustments: data.adjustments,
      reason: data.reason,
      date: data.date,
      internalNotes: data.internalNotes,
      refund:
        data.refundAmount > 0 && data.refundAccountId
          ? { amount: data.refundAmount, paymentAccountId: data.refundAccountId, reference: data.refundReference }
          : null,
      user: { id: auth.user.id, name: auth.user.name },
    });

    await recordAudit({
      auth,
      action: "sales.credit_note_issued",
      entity: "CreditNote",
      entityId: result.id,
      summary: `${result.number} for ${result.grandTotal}${result.refunded > 0 ? `, ${result.refunded} refunded` : " (credit on account)"} — ${data.reason}`,
      metadata: {
        total: result.grandTotal,
        refunded: result.refunded,
        lines: data.lines.length,
        adjustments: data.adjustments.length,
        invoiceStatus: result.invoice.status,
      },
    });
    revalidateCredits(data.invoiceId);
    return { id: result.id, number: result.number, grandTotal: result.grandTotal, refunded: result.refunded };
  });
}

/** Withdraws a credit note issued in error. The record stays; the credit does not. */
export async function withdrawCreditNote(input: unknown): Promise<ActionResult<{ number: string; invoiceNumber: string }>> {
  return runAction(async () => {
    const auth = await authorize("SALES", "delete");
    const data = parseInput(cancelCreditNoteSchema, input);
    const result = await cancelCreditNote({ creditNoteId: data.creditNoteId, reason: data.reason, user: { id: auth.user.id, name: auth.user.name } });

    await recordAudit({
      auth,
      action: "sales.credit_note_cancelled",
      entity: "CreditNote",
      entityId: data.creditNoteId,
      summary: `${result.number} against ${result.invoiceNumber} cancelled — ${data.reason}`,
    });
    revalidateCredits();
    return { number: result.number, invoiceNumber: result.invoiceNumber };
  });
}
