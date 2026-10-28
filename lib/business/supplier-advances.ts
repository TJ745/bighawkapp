import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { parseDateOnly } from "@/lib/dates";
import { advanceBalance } from "./advance-balance";
import { nextDocumentNumber } from "./numbering";
import { refreshPurchase } from "./procurement";
import { round2 } from "./totals";

export { advanceBalance, type AdvanceBalance } from "./advance-balance";

/**
 * Supplier prepayments.
 *
 * Money paid to a supplier before there is a bill to put it against — a deposit on an order,
 * payment up front for materials, a retainer. The mirror of `advances.ts`, and the rule is the
 * same one read backwards:
 *
 * **The cash leaves once, so Finance counts it once.** The prepayment row *is* the money-out
 * event, on the date the money left. Applying it to a purchase later moves nothing: it only
 * decides which bill the money settles. That is why an application writes a `PurchasePayment`
 * tagged with the prepayment and Finance **excludes** those rows — otherwise the same riyal would
 * appear as an expense twice, and every bank balance would be understated by the value of every
 * deposit ever paid.
 *
 * Money the supplier sends back is its own row on its own date (`SupplierAdvanceRefund`), because
 * Finance is cash-based: money that left in one month and returned in the next is two events, not
 * a smaller single one.
 */

async function usableAccount(paymentAccountId: string) {
  const account = await db.paymentAccount.findUnique({ where: { id: paymentAccountId }, select: { id: true, isActive: true, name: true } });
  if (!account) throw new BusinessError("Choose the account the money came out of.");
  if (!account.isActive) throw new BusinessError(`${account.name} is not in use.`);
  return account;
}

export type PaySupplierAdvanceInput = {
  supplierId: string;
  amount: number;
  date: string;
  paymentAccountId: string;
  reference: string | null;
  notes: string | null;
  user: { id: string; name: string };
};

/** Records money paid in advance. This is the row Finance reads as an expense. */
export async function paySupplierAdvance(input: PaySupplierAdvanceInput) {
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new BusinessError("Enter the amount paid.");

  const supplier = await db.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, name: true, isActive: true } });
  if (!supplier) throw new BusinessError("Choose the supplier who was paid.");
  if (!supplier.isActive) throw new BusinessError(`${supplier.name} is not in use.`);
  const account = await usableAccount(input.paymentAccountId);

  const date = parseDateOnly(input.date);
  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "SUPPLIER_ADVANCE", date);
    const advance = await tx.supplierAdvance.create({
      data: {
        number,
        supplierId: supplier.id,
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
    return { id: advance.id, number: advance.number, amount, supplierName: supplier.name };
  });
}

/**
 * Puts prepaid money against a purchase.
 *
 * No money moves — the cash has already left the account — so this writes a payment row tagged
 * with the prepayment, which Finance skips, and the purchase's status follows from it as it would
 * from any other payment.
 */
export async function applySupplierAdvance(input: { advanceId: string; purchaseId: string; amount: number; date: string; user: { id: string; name: string } }) {
  const advance = await db.supplierAdvance.findUnique({
    where: { id: input.advanceId },
    select: { id: true, number: true, status: true, supplierId: true, amount: true, appliedTotal: true, refundedTotal: true, paymentAccountId: true },
  });
  if (!advance) throw new BusinessError("That prepayment no longer exists.");
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} was cancelled, so it holds no money.`);

  const purchase = await db.purchase.findUnique({
    where: { id: input.purchaseId },
    select: { id: true, number: true, status: true, supplierId: true, grandTotal: true, paidTotal: true },
  });
  if (!purchase) throw new BusinessError("That purchase no longer exists.");
  // A draft has not been agreed with the supplier, so there is nothing yet to settle.
  if (purchase.status === "DRAFT") throw new BusinessError(`${purchase.number} is still a draft. Confirm it before settling it from a prepayment.`);
  /**
   * One supplier's money cannot settle another's bill. Without this the feature would be a way of
   * moving balances between suppliers, which is exactly what a deposit must never do.
   */
  if (purchase.supplierId !== advance.supplierId) {
    throw new BusinessError(`${advance.number} belongs to a different supplier than ${purchase.number}.`);
  }

  const balance = advanceBalance(advance);
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new BusinessError("Enter how much of the prepayment to apply.");
  if (amount > balance.available) {
    throw new BusinessError(
      balance.available <= 0 ? `${advance.number} has nothing left on it.` : `Only ${balance.available} is left on ${advance.number}.`,
    );
  }

  const owing = round2(num(purchase.grandTotal) - num(purchase.paidTotal));
  if (owing <= 0) throw new BusinessError(`${purchase.number} has nothing left to pay.`);
  if (amount > owing) throw new BusinessError(`${purchase.number} only has ${owing} left to pay.`);

  const date = parseDateOnly(input.date);
  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "PAYMENT", date);
    await tx.purchasePayment.create({
      data: {
        number,
        purchaseId: purchase.id,
        supplierAdvanceId: advance.id,
        amount,
        date,
        // The account the money already left from, so a later report still knows where it went.
        paymentAccountId: advance.paymentAccountId,
        notes: `Settled from prepayment ${advance.number}`,
        createdById: input.user.id,
      },
    });

    const applied = round2(num(advance.appliedTotal) + amount);
    const settled = round2(num(advance.amount) - applied - num(advance.refundedTotal)) <= 0;
    await tx.supplierAdvance.update({
      where: { id: advance.id },
      data: { appliedTotal: applied, status: settled ? "SETTLED" : "OPEN" },
    });

    const refreshed = await refreshPurchase(tx, purchase.id);
    return {
      advanceNumber: advance.number,
      purchaseNumber: purchase.number,
      amount,
      purchase: refreshed,
      remaining: round2(num(advance.amount) - applied - num(advance.refundedTotal)),
    };
  });
}

/**
 * Takes an application back off a purchase.
 *
 * The money returns to the prepayment's balance rather than to the business: nothing came back
 * from the supplier, so nothing arrives. Deleting the payment row is what undoes it.
 */
export async function unapplySupplierAdvance(input: { paymentId: string; user: { id: string; name: string } }) {
  const payment = await db.purchasePayment.findUnique({
    where: { id: input.paymentId },
    select: { id: true, amount: true, purchaseId: true, supplierAdvanceId: true, purchase: { select: { number: true } } },
  });
  if (!payment) throw new BusinessError("That payment no longer exists.");
  if (!payment.supplierAdvanceId) throw new BusinessError("That payment was not funded by a prepayment, so it cannot be returned to one.");

  const advance = await db.supplierAdvance.findUniqueOrThrow({
    where: { id: payment.supplierAdvanceId },
    select: { id: true, number: true, amount: true, appliedTotal: true, refundedTotal: true, status: true },
  });
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} has been cancelled.`);

  const amount = round2(num(payment.amount));
  return db.$transaction(async (tx) => {
    await tx.purchasePayment.delete({ where: { id: payment.id } });
    const applied = round2(Math.max(0, num(advance.appliedTotal) - amount));
    await tx.supplierAdvance.update({
      where: { id: advance.id },
      // Money is free again, so the prepayment is open whatever it was before.
      data: { appliedTotal: applied, status: "OPEN" },
    });
    const refreshed = await refreshPurchase(tx, payment.purchaseId);
    return { advanceNumber: advance.number, purchaseNumber: payment.purchase.number, amount, purchase: refreshed };
  });
}

/**
 * Records unused prepayment money coming back from the supplier.
 *
 * Its own row on its own date, because the money arriving is a separate cash event from the money
 * leaving — netting it off the prepayment would move the expense out of the month it belonged to.
 */
export async function refundSupplierAdvance(input: {
  advanceId: string;
  amount: number;
  date: string;
  paymentAccountId: string;
  reference: string | null;
  user: { id: string; name: string };
}) {
  const advance = await db.supplierAdvance.findUnique({
    where: { id: input.advanceId },
    select: { id: true, number: true, status: true, amount: true, appliedTotal: true, refundedTotal: true },
  });
  if (!advance) throw new BusinessError("That prepayment no longer exists.");
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} was cancelled, so it holds no money.`);

  const balance = advanceBalance(advance);
  const amount = round2(num(input.amount));
  if (amount <= 0) throw new BusinessError("Enter how much came back.");
  if (amount > balance.available) {
    throw new BusinessError(
      balance.available <= 0
        ? `${advance.number} has nothing left to come back — it has all been applied to purchases.`
        : `Only ${balance.available} is left on ${advance.number}.`,
    );
  }
  const account = await usableAccount(input.paymentAccountId);

  const date = parseDateOnly(input.date);
  return db.$transaction(async (tx) => {
    await tx.supplierAdvanceRefund.create({
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
    await tx.supplierAdvance.update({ where: { id: advance.id }, data: { refundedTotal: refunded, status: settled ? "SETTLED" : "OPEN" } });
    return { number: advance.number, amount, remaining: round2(num(advance.amount) - num(advance.appliedTotal) - refunded) };
  });
}

/**
 * Withdraws a prepayment keyed in error.
 *
 * The record stays — money was recorded against a supplier — but it stops counting: Finance reads
 * the prepayment row, so cancelling takes the expense back out. Anything already applied has to be
 * taken off its purchase first, because that money is settling a real bill.
 */
export async function cancelSupplierAdvance(input: { advanceId: string; reason: string; user: { id: string; name: string } }) {
  const advance = await db.supplierAdvance.findUnique({
    where: { id: input.advanceId },
    select: { id: true, number: true, status: true, amount: true, appliedTotal: true, refundedTotal: true, _count: { select: { payments: true, refunds: true } } },
  });
  if (!advance) throw new BusinessError("That prepayment no longer exists.");
  if (advance.status === "CANCELLED") throw new BusinessError(`${advance.number} has already been cancelled.`);
  if (advance._count.payments > 0) {
    throw new BusinessError(`${advance.number} is settling a purchase. Take it off that purchase first, then cancel it.`);
  }
  if (advance._count.refunds > 0) {
    throw new BusinessError(`${advance.number} has already had money come back against it, so it cannot be cancelled.`);
  }

  await db.supplierAdvance.update({
    where: { id: advance.id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
  });
  return { number: advance.number, amount: num(advance.amount) };
}
