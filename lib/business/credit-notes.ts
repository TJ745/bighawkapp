import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { nextDocumentNumber } from "./numbering";
import { refreshInvoice } from "./sales";
import { calcLine, round2 } from "./totals";

/**
 * Credit notes.
 *
 * An issued invoice is never edited or deleted, so when goods come back, something was
 * overcharged, part of an order is cancelled or a discount is agreed after the fact, the invoice is
 * put right by a credit note that references it.
 *
 * Two rules carry the whole feature:
 *
 * 1. **Amounts are recomputed from the invoice's own lines** by `calcLine`, never apportioned by a
 *    ratio, so the VAT reverses exactly as it was charged.
 * 2. **Money only moves if money is given back**, and then it moves as a negative `InvoicePayment`
 *    tagged with the credit note — the same rows the money came in on. Finance, account balances
 *    and receivables therefore net out with no second path. A credit left against the account
 *    writes no payment row at all: nothing has moved, the customer simply owes less.
 */

export type CreditableLine = {
  invoiceItemId: string;
  description: string;
  quantity: number;
  creditedQuantity: number;
  /** What is still open to credit on this line. */
  creditableQuantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
};

/** What is still creditable on an invoice, line by line. */
export async function getCreditableLines(invoiceId: string): Promise<CreditableLine[]> {
  const invoice = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) throw new BusinessError("That invoice no longer exists.");

  return invoice.items.map((item) => {
    const quantity = num(item.quantity);
    const credited = num(item.creditedQuantity);
    return {
      invoiceItemId: item.id,
      description: item.description,
      quantity,
      creditedQuantity: credited,
      creditableQuantity: round2(Math.max(0, quantity - credited)),
      unitPrice: num(item.unitPrice),
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
    };
  });
}

export type CreditLineInput = { invoiceItemId: string; quantity: number };

/**
 * A credit for an amount rather than for goods: a goodwill discount, a correction, a waived charge.
 *
 * It has no invoice line behind it, so `creditedQuantity` does not apply and nothing caps it but
 * the invoice's own total. The amount is net and the VAT is added, exactly as an invoice line works.
 */
export type CreditAdjustmentInput = { description: string; amount: number; vatRate: number };

/** A priced credit note line. `invoiceItemId` is null for an adjustment, which credits no goods. */
export type CreditQuoteLine = {
  invoiceItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineVat: number;
  lineTotal: number;
};

export type CreditQuote = {
  lines: CreditQuoteLine[];
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
};

/**
 * Prices a proposed credit note from the original line figures. The same function serves the
 * preview on screen and the amounts that get written, so the two cannot disagree.
 */
export async function quoteCreditNote(invoiceId: string, lines: CreditLineInput[], adjustments: CreditAdjustmentInput[] = []): Promise<CreditQuote> {
  if (lines.length === 0 && adjustments.length === 0) {
    throw new BusinessError("Choose at least one line to credit, or add an adjustment for an amount.");
  }
  const creditable = await getCreditableLines(invoiceId);

  const pricedLines: CreditQuoteLine[] = lines.map((line) => {
    const original = creditable.find((row) => row.invoiceItemId === line.invoiceItemId);
    if (!original) throw new BusinessError("One of those lines is not on this invoice.");
    const quantity = round2(num(line.quantity));
    if (quantity <= 0) throw new BusinessError(`Enter how much of "${original.description}" is being credited.`);
    if (quantity > original.creditableQuantity) {
      throw new BusinessError(
        original.creditableQuantity === 0
          ? `"${original.description}" has already been credited in full.`
          : `Only ${original.creditableQuantity} of "${original.description}" can still be credited.`,
      );
    }
    const totals = calcLine({ quantity, unitPrice: original.unitPrice, discountPercent: original.discountPercent, vatRate: original.vatRate });
    return {
      invoiceItemId: original.invoiceItemId,
      description: original.description,
      quantity,
      unitPrice: original.unitPrice,
      discountPercent: original.discountPercent,
      vatRate: original.vatRate,
      lineSubtotal: totals.subtotal,
      lineDiscount: totals.discount,
      lineVat: totals.vat,
      lineTotal: totals.total,
    };
  });

  /**
   * An adjustment is one unit priced at the amount being credited, so it goes through `calcLine`
   * like everything else — one implementation of the arithmetic, and the VAT comes out right
   * without a second formula to keep in step.
   */
  const pricedAdjustments: CreditQuoteLine[] = adjustments.map((adjustment) => {
    const amount = round2(num(adjustment.amount));
    if (amount <= 0) throw new BusinessError(`Enter the amount being credited for "${adjustment.description}".`);
    const vatRate = num(adjustment.vatRate);
    const totals = calcLine({ quantity: 1, unitPrice: amount, discountPercent: 0, vatRate });
    return {
      invoiceItemId: null,
      description: adjustment.description,
      quantity: 1,
      unitPrice: amount,
      discountPercent: 0,
      vatRate,
      lineSubtotal: totals.subtotal,
      lineDiscount: totals.discount,
      lineVat: totals.vat,
      lineTotal: totals.total,
    };
  });

  const priced = [...pricedLines, ...pricedAdjustments];
  const sum = (pick: (line: CreditQuoteLine) => number) => round2(priced.reduce((total, line) => total + pick(line), 0));
  return {
    lines: priced,
    subtotal: sum((l) => l.lineSubtotal),
    discountTotal: sum((l) => l.lineDiscount),
    vatTotal: sum((l) => l.lineVat),
    grandTotal: sum((l) => l.lineTotal),
  };
}

export type CreateCreditNoteInput = {
  invoiceId: string;
  lines: CreditLineInput[];
  /** Credits for an amount rather than for goods. Either list may be empty, but not both. */
  adjustments?: CreditAdjustmentInput[];
  reason: string;
  date: string;
  internalNotes: string | null;
  /** Money handed back now. Left out, the credit simply reduces what the customer owes. */
  refund: { amount: number; paymentAccountId: string; reference: string | null } | null;
  user: { id: string; name: string };
};

export async function createCreditNote(input: CreateCreditNoteInput) {
  const invoice = await db.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { id: true, number: true, status: true, customerId: true, grandTotal: true, paidTotal: true, creditedTotal: true },
  });
  if (!invoice) throw new BusinessError("That invoice no longer exists.");
  // A draft has not been given to anybody, so there is nothing to put right — edit it instead.
  if (invoice.status === "DRAFT") throw new BusinessError("This invoice is still a draft. Edit it instead of crediting it.");

  const quote = await quoteCreditNote(input.invoiceId, input.lines, input.adjustments ?? []);

  // The invoice cannot be credited for more than it was ever worth.
  const alreadyCredited = num(invoice.creditedTotal);
  if (round2(alreadyCredited + quote.grandTotal) > num(invoice.grandTotal)) {
    throw new BusinessError(`That is more than is left on ${invoice.number}: ${round2(num(invoice.grandTotal) - alreadyCredited)} can still be credited.`);
  }

  let refund: { amount: number; paymentAccountId: string; reference: string | null } | null = null;
  if (input.refund && input.refund.amount > 0) {
    const amount = round2(input.refund.amount);
    if (amount > quote.grandTotal) throw new BusinessError(`The refund cannot be more than the credit note itself (${quote.grandTotal}).`);
    // You can only hand back money the customer actually paid you.
    const paid = num(invoice.paidTotal);
    if (amount > paid) throw new BusinessError(`Only ${paid} has been paid on this invoice, so no more than that can be refunded.`);
    const account = await db.paymentAccount.findUnique({ where: { id: input.refund.paymentAccountId }, select: { id: true, isActive: true, name: true } });
    if (!account) throw new BusinessError("Choose an account to refund from.");
    if (!account.isActive) throw new BusinessError(`${account.name} is not in use.`);
    refund = { amount, paymentAccountId: account.id, reference: input.refund.reference };
  }

  const date = new Date(`${input.date}T00:00:00.000Z`);

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "CREDIT_NOTE", date);

    const note = await tx.creditNote.create({
      data: {
        number,
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        date,
        reason: input.reason,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        vatTotal: quote.vatTotal,
        grandTotal: quote.grandTotal,
        refundedTotal: refund?.amount ?? 0,
        internalNotes: input.internalNotes,
        createdById: input.user.id,
        createdByName: input.user.name,
        items: {
          create: quote.lines.map((line, index) => ({
            invoiceItemId: line.invoiceItemId,
            sortOrder: index,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            vatRate: line.vatRate,
            lineSubtotal: line.lineSubtotal,
            lineDiscount: line.lineDiscount,
            lineVat: line.lineVat,
            lineTotal: line.lineTotal,
          })),
        },
      },
      select: { id: true, number: true },
    });

    // The invoice line is what caps any later credit against the same goods. An adjustment credits
    // no goods, so there is no quantity to count against anything — only the invoice total caps it.
    for (const line of quote.lines) {
      if (!line.invoiceItemId) continue;
      await tx.invoiceItem.update({ where: { id: line.invoiceItemId }, data: { creditedQuantity: { increment: line.quantity } } });
    }

    if (refund) {
      // Money out through the rows money came in on: a negative payment, tagged with this note.
      const paymentNumber = await nextDocumentNumber(tx, "PAYMENT", date);
      await tx.invoicePayment.create({
        data: {
          number: paymentNumber,
          invoiceId: invoice.id,
          creditNoteId: note.id,
          amount: -refund.amount,
          date,
          paymentAccountId: refund.paymentAccountId,
          reference: refund.reference,
          notes: `Refund on credit note ${note.number}`,
          createdById: input.user.id,
        },
      });
    }

    const refreshed = await refreshInvoice(tx, invoice.id);
    return { id: note.id, number: note.number, grandTotal: quote.grandTotal, refunded: refund?.amount ?? 0, invoice: refreshed };
  });
}

/**
 * Withdraws a credit note issued in error. The record stays — it was a tax document — but the
 * credit goes away: the lines are freed to be credited again and any refund row is removed, which
 * takes the money back out of Finance exactly as voiding a POS sale does.
 */
export async function cancelCreditNote(input: { creditNoteId: string; reason: string; user: { id: string; name: string } }) {
  const note = await db.creditNote.findUnique({
    where: { id: input.creditNoteId },
    include: { items: true, invoice: { select: { id: true, number: true } } },
  });
  if (!note) throw new BusinessError("That credit note no longer exists.");
  if (note.status === "CANCELLED") throw new BusinessError("That credit note has already been cancelled.");

  return db.$transaction(async (tx) => {
    for (const item of note.items) {
      if (!item.invoiceItemId) continue;
      await tx.invoiceItem.update({ where: { id: item.invoiceItemId }, data: { creditedQuantity: { decrement: num(item.quantity) } } });
    }
    // Removing the refund row puts the money back where it was, because Finance reads these rows.
    await tx.invoicePayment.deleteMany({ where: { creditNoteId: note.id } });
    await tx.creditNote.update({
      where: { id: note.id },
      data: { status: "CANCELLED", refundedTotal: 0, cancelledAt: new Date(), cancelledByName: input.user.name, cancelReason: input.reason },
    });

    const refreshed = await refreshInvoice(tx, note.invoice.id);
    return { number: note.number, invoiceNumber: note.invoice.number, invoice: refreshed };
  });
}

/** What an invoice has been credited, counting only the notes that still stand. */
export async function creditedTotalFor(tx: { creditNote: { aggregate: typeof db.creditNote.aggregate } }, invoiceId: string) {
  const sum = await tx.creditNote.aggregate({ where: { invoiceId, status: "ISSUED" }, _sum: { grandTotal: true } });
  return round2(num(sum._sum.grandTotal));
}
