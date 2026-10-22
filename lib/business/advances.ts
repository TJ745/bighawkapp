import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { parseDateOnly } from "@/lib/dates";
import { advanceBalance } from "./advance-balance";
import { nextDocumentNumber } from "./numbering";
import { refreshInvoice } from "./sales";
import { round2 } from "./totals";

export { advanceBalance, type AdvanceBalance } from "./advance-balance";

/**
 * Customer advances.
 *
 * Money a customer hands over before there is an invoice to put it against — a deposit on an
 * order, a retainer, payment up front. One rule decides the whole feature:
 *
 * **The cash arrives once, so Finance counts it once.** The advance row *is* the money-in event, on
 * the date the money arrived. Applying it to an invoice later moves nothing: it only decides what
 * the money settles. That is why an application writes an `InvoicePayment` tagged with the advance
 * and Finance **excludes** those rows — otherwise the same riyal would appear as income twice, and
 * the bank balance would be wrong by the amount of every deposit ever taken.
 *
 * Giving unused money back is its own row on its own date (`CustomerAdvanceRefund`), because
 * Finance is cash-based: money that arrived in one month and left in the next is two events, not a
 * smaller single one.
 */

async function usableAccount(paymentAccountId: string) {
  const account = await db.paymentAccount.findUnique({ where: { id: paymentAccountId }, select: { id: true, isActive: true, name: true } });
  if (!account) throw new BusinessError("Choose the account the money went into.");
  if (!account.isActive) throw new BusinessError(`${account.name} is not in use.`);
  return account;
}

export type TakeAdvanceInput = {
  customerId: string;
  amount: number;
  date: string;
  paymentAccountId: string;
  reference: string | null;
  notes: string | null;
  user: { id: string; name: string };
};

/** Records money received in advance. This is the row Finance reads as income. */
export async function takeAdvance(input: TakeAdvanceInput) {
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new BusinessError("Enter the amount received.");

  const customer = await db.customer.findUnique({ where: { id: input.customerId }, select: { id: true, name: true, isActive: true } });
  if (!customer) throw new BusinessError("Choose the customer who paid.");
  if (!customer.isActive) throw new BusinessError(`${customer.name} is not in use.`);
  const account = await usableAccount(input.paymentAccountId);

  const date = parseDateOnly(input.date);
  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "CUSTOMER_ADVANCE", date);
    const advance = await tx.customerAdvance.create({
      data: {
        number,
        customerId: customer.id,
        date,
        amount,
        paymentAccountId: account.id,
        reference: input.reference,
        notes: input.notes,
        createdById: input.user.id,
        createdByName: input.user.name,
      },
      select: { id: true, number: true },
    });
    return { id: advance.id, number: advance.number, amount, customerName: customer.name };
  });
}

/**
 * Puts advance money against an invoice.
 *
 * No money moves — the cash is already in the account — so this writes a payment row tagged with
 * the advance, which Finance skips, and the invoice's status follows from it as it would from any
 * other payment.
 */
export async function applyAdvance(input: { advanceId: string; invoiceId: string; amount: number; date: string; user: { id: string; name: string } }) {
  const advance = await db.customerAdvance.findUnique({
    where: { id: input.advanceId },
    select: { id: true, number: true, status: true, customerId: true, amount: true, appliedTotal: true, refundedTotal: true, paymentAccountId: true },
  });
  if (!advance) throw new BusinessError("That advance no longer exists.");
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} was cancelled, so it holds no money.`);

  const invoice = await db.invoice.findUnique({
    where: { id: input.invoiceId },
    select: { id: true, number: true, status: true, customerId: true, grandTotal: true, paidTotal: true, creditedTotal: true },
  });
  if (!invoice) throw new BusinessError("That invoice no longer exists.");
  // A draft has not been given to the customer, so there is nothing yet to settle.
  if (invoice.status === "DRAFT") throw new BusinessError(`${invoice.number} is still a draft. Issue it before settling it from an advance.`);
  /**
   * One customer's money cannot settle another's bill. Without this the feature would be a way of
   * moving balances between customers, which is exactly what a deposit must never do.
   */
  if (invoice.customerId !== advance.customerId) {
    throw new BusinessError(`${advance.number} belongs to a different customer than ${invoice.number}.`);
  }

  const balance = advanceBalance(advance);
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new BusinessError("Enter how much of the advance to apply.");
  if (amount > balance.available) {
    throw new BusinessError(
      balance.available <= 0 ? `${advance.number} has nothing left on it.` : `Only ${balance.available} is left on ${advance.number}.`,
    );
  }

  const owing = round2(num(invoice.grandTotal) - num(invoice.paidTotal) - num(invoice.creditedTotal));
  if (owing <= 0) throw new BusinessError(`${invoice.number} has nothing left to pay.`);
  if (amount > owing) throw new BusinessError(`${invoice.number} only has ${owing} left to pay.`);

  const date = parseDateOnly(input.date);
  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "PAYMENT", date);
    await tx.invoicePayment.create({
      data: {
        number,
        invoiceId: invoice.id,
        customerAdvanceId: advance.id,
        amount,
        date,
        // The account the money is already sitting in, so a later report still knows where it is.
        paymentAccountId: advance.paymentAccountId,
        notes: `Settled from advance ${advance.number}`,
        createdById: input.user.id,
      },
    });

    const applied = round2(num(advance.appliedTotal) + amount);
    const settled = round2(num(advance.amount) - applied - num(advance.refundedTotal)) <= 0;
    await tx.customerAdvance.update({
      where: { id: advance.id },
      data: { appliedTotal: applied, status: settled ? "SETTLED" : "OPEN" },
    });

    const refreshed = await refreshInvoice(tx, invoice.id);
    return { advanceNumber: advance.number, invoiceNumber: invoice.number, amount, invoice: refreshed, remaining: round2(num(advance.amount) - applied - num(advance.refundedTotal)) };
  });
}

/**
 * Takes an application back off an invoice.
 *
 * The money returns to the advance's balance rather than to the customer: nothing left the
 * business, so nothing comes back in. Deleting the payment row is what undoes it, exactly as
 * cancelling a credit note removes its refund row.
 */
export async function unapplyAdvance(input: { paymentId: string; user: { id: string; name: string } }) {
  const payment = await db.invoicePayment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, amount: true, invoiceId: true, customerAdvanceId: true, invoice: { select: { number: true } } },
  });
  if (!payment) throw new BusinessError("That payment no longer exists.");
  if (!payment.customerAdvanceId) throw new BusinessError("That payment was not funded by an advance, so it cannot be returned to one.");

  const advance = await db.customerAdvance.findUniqueOrThrow({
    where: { id: payment.customerAdvanceId },
    select: { id: true, number: true, amount: true, appliedTotal: true, refundedTotal: true, status: true },
  });
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} has been cancelled.`);

  const amount = round2(num(payment.amount));
  return db.$transaction(async (tx) => {
    await tx.invoicePayment.delete({ where: { id: payment.id } });
    const applied = round2(Math.max(0, num(advance.appliedTotal) - amount));
    await tx.customerAdvance.update({
      where: { id: advance.id },
      // Money is free again, so the advance is open whatever it was before.
      data: { appliedTotal: applied, status: "OPEN" },
    });
    const refreshed = await refreshInvoice(tx, payment.invoiceId);
    return { advanceNumber: advance.number, invoiceNumber: payment.invoice.number, amount, invoice: refreshed };
  });
}

/**
 * Hands unused advance money back.
 *
 * Its own row on its own date, because the money leaving is a separate cash event from the money
 * arriving — netting it off the advance would move income out of the month it belonged to.
 */
export async function refundAdvance(input: {
  advanceId: string;
  amount: number;
  date: string;
  paymentAccountId: string;
  reference: string | null;
  user: { id: string; name: string };
}) {
  const advance = await db.customerAdvance.findUnique({
    where: { id: input.advanceId },
    select: { id: true, number: true, status: true, amount: true, appliedTotal: true, refundedTotal: true },
  });
  if (!advance) throw new BusinessError("That advance no longer exists.");
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} was cancelled, so it holds no money.`);

  const balance = advanceBalance(advance);
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new BusinessError("Enter how much to give back.");
  if (amount > balance.available) {
    throw new BusinessError(
      balance.available <= 0
        ? `${advance.number} has nothing left to give back — it has all been applied to invoices.`
        : `Only ${balance.available} is left on ${advance.number}.`,
    );
  }
  const account = await usableAccount(input.paymentAccountId);

  const date = parseDateOnly(input.date);
  return db.$transaction(async (tx) => {
    await tx.customerAdvanceRefund.create({
      data: {
        advanceId: advance.id,
        amount,
        date,
        paymentAccountId: account.id,
        reference: input.reference,
        createdById: input.user.id,
        createdByName: input.user.name,
      },
    });
    const refunded = round2(num(advance.refundedTotal) + amount);
    const settled = round2(num(advance.amount) - num(advance.appliedTotal) - refunded) <= 0;
    await tx.customerAdvance.update({ where: { id: advance.id }, data: { refundedTotal: refunded, status: settled ? "SETTLED" : "OPEN" } });
    return { number: advance.number, amount, remaining: round2(num(advance.amount) - num(advance.appliedTotal) - refunded) };
  });
}

/**
 * Withdraws an advance keyed in error.
 *
 * The record stays — money was recorded against a customer — but it stops counting: Finance reads
 * the advance row, so cancelling takes the income back out, the way cancelling a goods receipt
 * takes the stock back off. Anything already applied has to be taken off its invoice first,
 * because that money is settling a real bill.
 */
export async function cancelAdvance(input: { advanceId: string; reason: string; user: { id: string; name: string } }) {
  const advance = await db.customerAdvance.findUnique({
    where: { id: input.advanceId },
    select: { id: true, number: true, status: true, amount: true, appliedTotal: true, refundedTotal: true, _count: { select: { payments: true, refunds: true } } },
  });
  if (!advance) throw new BusinessError("That advance no longer exists.");
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} has already been cancelled.`);
  if (advance._count.payments > 0) {
    throw new BusinessError(`${advance.number} is settling an invoice. Take it off that invoice first, then cancel it.`);
  }
  if (advance._count.refunds > 0) {
    throw new BusinessError(`${advance.number} has already had money given back against it, so it cannot be cancelled.`);
  }

  await db.customerAdvance.update({
    where: { id: advance.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
  });
  return { number: advance.number, amount: num(advance.amount) };
}
