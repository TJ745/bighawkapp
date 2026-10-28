import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { applyStockMovement, round3 } from "./inventory";
import { nextDocumentNumber } from "./numbering";
import { refreshPurchase } from "./procurement";
import { calcLine, round2 } from "./totals";

/**
 * Goods going back to a supplier.
 *
 * An issued invoice is put right by a credit note; a received purchase had nothing at all. This
 * is that missing half, and it is the only thing in the app that writes a `PURCHASE_RETURN` stock
 * movement — a kind that existed in the schema and in the UI's labels while nothing ever produced
 * one.
 *
 * Three rules carry it, two of them borrowed from credit notes because they were already right:
 *
 * 1. **Amounts are recomputed from the purchase's own lines** by `calcLine`, never apportioned by
 *    a ratio, so the VAT reverses exactly as it was charged.
 * 2. **Money only moves if the supplier actually sends some back**, and then as a negative
 *    `PurchasePayment` tagged with the return — the rows the money went out on. Credit left on
 *    the account writes no payment row at all: nothing moved, the business simply owes less.
 * 3. **Only what arrived can go back.** `PurchaseItem.returnedQuantity` is capped by
 *    `receivedQuantity`, exactly as that is capped by the ordered quantity. Returning something
 *    that never turned up would take stock off a shelf it was never on.
 */

export type ReturnableLine = {
  purchaseItemId: string;
  description: string;
  /** The catalogue item this line became when it was received, if it became one. */
  variantId: string | null;
  receivedQuantity: number;
  returnedQuantity: number;
  /** What is still on the shelf from this line, as far as the purchase knows. */
  returnableQuantity: number;
  unitPrice: number;
  discountPercent: number;
  vatRate: number;
};

/** What can still go back on a purchase, line by line. */
export async function getReturnableLines(purchaseId: string): Promise<ReturnableLine[]> {
  const purchase = await db.purchase.findUnique({
    where: { id: purchaseId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!purchase) throw new BusinessError("That purchase no longer exists.");

  return purchase.items.map((item) => {
    const received = num(item.receivedQuantity);
    const returned = num(item.returnedQuantity);
    return {
      purchaseItemId: item.id,
      description: item.description,
      variantId: item.variantId,
      receivedQuantity: received,
      returnedQuantity: returned,
      returnableQuantity: round3(Math.max(0, received - returned)),
      unitPrice: num(item.unitPrice),
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
    };
  });
}

export type ReturnLineInput = { purchaseItemId: string; quantity: number };

export type ReturnQuoteLine = {
  purchaseItemId: string;
  variantId: string | null;
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

export type ReturnQuote = {
  lines: ReturnQuoteLine[];
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
};

/**
 * Prices a proposed return from the purchase's own line figures. The same function serves the
 * preview on screen and the amounts that get written, so the two cannot disagree.
 */
export async function quotePurchaseReturn(purchaseId: string, lines: ReturnLineInput[]): Promise<ReturnQuote> {
  if (lines.length === 0) throw new BusinessError("Choose at least one line to send back.");
  const returnable = await getReturnableLines(purchaseId);

  const priced: ReturnQuoteLine[] = lines.map((line) => {
    const original = returnable.find((row) => row.purchaseItemId === line.purchaseItemId);
    if (!original) throw new BusinessError("One of those lines is not on this purchase.");
    const quantity = round3(num(line.quantity));
    if (quantity <= 0) throw new BusinessError(`Enter how much of "${original.description}" is going back.`);
    if (quantity > original.returnableQuantity + 0.0001) {
      throw new BusinessError(
        original.receivedQuantity === 0
          ? `"${original.description}" has not arrived yet, so there is nothing to send back.`
          : original.returnableQuantity === 0
            ? `"${original.description}" has already gone back in full.`
            : `Only ${original.returnableQuantity} of "${original.description}" can still go back.`,
      );
    }
    const totals = calcLine({ quantity, unitPrice: original.unitPrice, discountPercent: original.discountPercent, vatRate: original.vatRate });
    return {
      purchaseItemId: original.purchaseItemId,
      variantId: original.variantId,
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

  const sum = (pick: (line: ReturnQuoteLine) => number) => round2(priced.reduce((total, line) => total + pick(line), 0));
  return {
    lines: priced,
    subtotal: sum((l) => l.lineSubtotal),
    discountTotal: sum((l) => l.lineDiscount),
    vatTotal: sum((l) => l.lineVat),
    grandTotal: sum((l) => l.lineTotal),
  };
}

export type CreatePurchaseReturnInput = {
  purchaseId: string;
  /** Where the goods physically leave from. Stock has to come off a shelf somewhere. */
  branchId: string;
  lines: ReturnLineInput[];
  reason: string;
  date: string;
  internalNotes: string | null;
  /** Money the supplier sends back now. Left out, the return simply reduces what is owed. */
  refund: { amount: number; paymentAccountId: string; reference: string | null } | null;
  user: { id: string; name: string };
};

export async function createPurchaseReturn(input: CreatePurchaseReturnInput) {
  const purchase = await db.purchase.findUnique({
    where: { id: input.purchaseId },
    select: { id: true, number: true, status: true, supplierId: true, grandTotal: true, paidTotal: true, creditedTotal: true, receivedAt: true },
  });
  if (!purchase) throw new BusinessError("That purchase no longer exists.");
  // Nothing has arrived, so there is nothing on a shelf to send back — edit the purchase instead.
  if (!purchase.receivedAt) throw new BusinessError(`Nothing has been received against ${purchase.number} yet, so there is nothing to send back.`);

  const branch = await db.branch.findUnique({ where: { id: input.branchId }, select: { id: true, name: true, isActive: true } });
  if (!branch) throw new BusinessError("Choose the branch the goods are leaving from.");
  if (!branch.isActive) throw new BusinessError(`${branch.name} is not in use.`);

  const quote = await quotePurchaseReturn(input.purchaseId, input.lines);

  // The purchase cannot be credited for more than it was ever worth.
  const alreadyCredited = num(purchase.creditedTotal);
  if (round2(alreadyCredited + quote.grandTotal) > num(purchase.grandTotal)) {
    throw new BusinessError(
      `That is more than is left on ${purchase.number}: ${round2(num(purchase.grandTotal) - alreadyCredited)} can still be credited.`,
    );
  }

  let refund: { amount: number; paymentAccountId: string; reference: string | null } | null = null;
  if (input.refund && input.refund.amount > 0) {
    const amount = round2(input.refund.amount);
    if (amount > quote.grandTotal) throw new BusinessError(`The refund cannot be more than the return itself (${quote.grandTotal}).`);
    // A supplier can only send back money that was actually sent to them.
    const paid = num(purchase.paidTotal);
    if (amount > paid) throw new BusinessError(`Only ${paid} has been paid on this purchase, so no more than that can come back.`);
    const account = await db.paymentAccount.findUnique({ where: { id: input.refund.paymentAccountId }, select: { id: true, isActive: true, name: true } });
    if (!account) throw new BusinessError("Choose the account the money is coming into.");
    if (!account.isActive) throw new BusinessError(`${account.name} is not in use.`);
    refund = { amount, paymentAccountId: account.id, reference: input.refund.reference };
  }

  // Which lines actually move stock: the ones that became a tracked catalogue item.
  const variantIds = [...new Set(quote.lines.map((line) => line.variantId).filter((id): id is string => Boolean(id)))];
  const variants = variantIds.length
    ? await db.itemVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, item: { select: { trackStock: true } } } })
    : [];

  const date = new Date(`${input.date}T00:00:00.000Z`);

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "PURCHASE_RETURN", date);

    const created = await tx.purchaseReturn.create({
      data: {
        number,
        purchaseId: purchase.id,
        supplierId: purchase.supplierId,
        branchId: branch.id,
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
            purchaseItemId: line.purchaseItemId,
            variantId: line.variantId,
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

    for (const line of quote.lines) {
      await tx.purchaseItem.update({ where: { id: line.purchaseItemId }, data: { returnedQuantity: { increment: line.quantity } } });

      // A charge (rent, courier, a fee) has no shelf to come off; the credit still stands.
      const tracked = variants.find((variant) => variant.id === line.variantId)?.item.trackStock;
      if (line.variantId && tracked) {
        await applyStockMovement(tx, {
          variantId: line.variantId,
          branchId: branch.id,
          kind: "PURCHASE_RETURN",
          quantity: -line.quantity,
          unitCost: line.unitPrice,
          referenceType: "PURCHASE",
          referenceId: purchase.id,
          reference: `${purchase.number} · ${created.number}`,
          note: input.reason,
          userId: input.user.id,
          userName: input.user.name,
        });
      }
    }

    if (refund) {
      // Money back through the rows money went out on: a negative payment, tagged with this return.
      const paymentNumber = await nextDocumentNumber(tx, "PAYMENT", date);
      await tx.purchasePayment.create({
        data: {
          number: paymentNumber,
          purchaseId: purchase.id,
          purchaseReturnId: created.id,
          amount: -refund.amount,
          date,
          paymentAccountId: refund.paymentAccountId,
          reference: refund.reference,
          notes: `Money back on return ${created.number}`,
          createdById: input.user.id,
        },
      });
    }

    const refreshed = await refreshPurchase(tx, purchase.id);
    return { id: created.id, number: created.number, grandTotal: quote.grandTotal, refunded: refund?.amount ?? 0, purchase: refreshed };
  });
}

/**
 * Withdraws a return raised in error.
 *
 * The record stays, but everything it did comes back: the goods go onto the shelf again, the
 * lines are freed to be returned later, and any money row is removed — which puts the money back
 * where it was, because Finance reads those rows.
 */
export async function cancelPurchaseReturn(input: { returnId: string; reason: string; user: { id: string; name: string } }) {
  const existing = await db.purchaseReturn.findUnique({
    where: { id: input.returnId },
    include: { items: true, purchase: { select: { id: true, number: true } } },
  });
  if (!existing) throw new BusinessError("That return no longer exists.");
  if (existing.status === "CANCELLED") throw new BusinessError(`${existing.number} has already been cancelled.`);

  const variantIds = [...new Set(existing.items.map((item) => item.variantId).filter((id): id is string => Boolean(id)))];
  const variants = variantIds.length
    ? await db.itemVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, item: { select: { trackStock: true } } } })
    : [];

  return db.$transaction(async (tx) => {
    for (const item of existing.items) {
      const quantity = num(item.quantity);
      await tx.purchaseItem.update({ where: { id: item.purchaseItemId }, data: { returnedQuantity: { decrement: quantity } } });

      const tracked = variants.find((variant) => variant.id === item.variantId)?.item.trackStock;
      if (item.variantId && tracked) {
        await applyStockMovement(tx, {
          variantId: item.variantId,
          branchId: existing.branchId,
          kind: "PURCHASE_RETURN",
          quantity,
          unitCost: num(item.unitPrice),
          referenceType: "PURCHASE",
          referenceId: existing.purchase.id,
          reference: `${existing.number} cancelled`,
          note: input.reason,
          userId: input.user.id,
          userName: input.user.name,
        });
      }
    }

    // Removing the money row puts the money back where it was, because Finance reads these rows.
    await tx.purchasePayment.deleteMany({ where: { purchaseReturnId: existing.id } });
    await tx.purchaseReturn.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", refundedTotal: 0, cancelledAt: new Date(), cancelReason: input.reason },
    });

    const refreshed = await refreshPurchase(tx, existing.purchase.id);
    return { number: existing.number, purchaseId: existing.purchase.id, purchaseNumber: existing.purchase.number, purchase: refreshed };
  });
}
