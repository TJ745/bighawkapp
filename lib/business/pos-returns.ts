import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import type { PosPaymentMethod } from "@/lib/generated/prisma/enums";
import { applyStockMovement, round3 } from "./inventory";
import { returnIngredients } from "./recipes";
import { reverseLineCommission } from "./staff";
import { returnMembershipUse } from "./memberships";
import { returnTickets } from "./tickets";
import { nextDocumentNumber } from "./numbering";
import { calcLine, round2 } from "./totals";

/**
 * Returns and refunds.
 *
 * A refund is money going back out of the same door it came in: the refund rows are *negative*
 * PosPayment records tagged with the return, so Finance, account balances and the shift drawer all
 * net out through the one path that already exists. The goods go back through the inventory engine,
 * and each sale line remembers how much has come back so a partial return cannot exceed it.
 *
 * Amounts are recomputed from the original line's price, discount and VAT — never taken from the
 * client, and never apportioned by a ratio that would drift by a halala.
 */

export type ReturnLineInput = {
  saleItemId: string;
  quantity: number;
};

export type RefundInput = {
  method: PosPaymentMethod;
  paymentAccountId: string;
  amount: number;
  reference?: string | null;
};

export type ReturnableLine = {
  saleItemId: string;
  variantId: string | null;
  name: string;
  sku: string | null;
  unit: string;
  soldQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitPrice: number;
  unitCost: number;
  discountPercent: number;
  vatRate: number;
  movedStock: boolean;
};

/** What is still returnable on a sale, line by line. */
export async function getReturnableLines(saleId: string): Promise<ReturnableLine[]> {
  const items = await db.posSaleItem.findMany({ where: { saleId }, orderBy: { sortOrder: "asc" } });
  return items.map((item) => {
    const sold = round3(num(item.quantity));
    const returned = round3(num(item.returnedQuantity));
    return {
      saleItemId: item.id,
      variantId: item.variantId,
      name: item.name,
      sku: item.sku,
      unit: item.unit,
      soldQuantity: sold,
      returnedQuantity: returned,
      returnableQuantity: round3(Math.max(0, sold - returned)),
      unitPrice: num(item.unitPrice),
      unitCost: num(item.unitCost),
      discountPercent: num(item.discountPercent),
      vatRate: num(item.vatRate),
      movedStock: item.movedStock,
    };
  });
}

export type ReturnQuote = {
  lines: (ReturnableLine & { quantity: number; lineSubtotal: number; lineDiscount: number; lineVat: number; lineTotal: number })[];
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  grandTotal: number;
  costTotal: number;
};

/**
 * Prices a proposed return using the original line figures. The same function serves the preview
 * the cashier sees and the amounts that get written, so they cannot disagree.
 */
export async function quoteReturn(saleId: string, lines: ReturnLineInput[]): Promise<ReturnQuote> {
  if (lines.length === 0) throw new BusinessError("Choose at least one item to return.");
  const returnable = await getReturnableLines(saleId);

  const priced = lines.map((line) => {
    const original = returnable.find((r) => r.saleItemId === line.saleItemId);
    if (!original) throw new BusinessError("One of the items is not part of this sale.");
    const quantity = round3(num(line.quantity));
    if (quantity <= 0) throw new BusinessError(`Enter how much of ${original.name} is coming back.`);
    if (quantity > original.returnableQuantity) {
      throw new BusinessError(`Only ${original.returnableQuantity} ${original.unit} of ${original.name} can still be returned.`);
    }
    const totals = calcLine({
      quantity,
      unitPrice: original.unitPrice,
      discountPercent: original.discountPercent,
      vatRate: original.vatRate,
    });
    return {
      ...original,
      quantity,
      lineSubtotal: totals.subtotal,
      lineDiscount: totals.discount,
      lineVat: totals.vat,
      lineTotal: totals.total,
    };
  });

  const sum = (pick: (line: (typeof priced)[number]) => number) => round2(priced.reduce((total, line) => total + pick(line), 0));
  return {
    lines: priced,
    subtotal: sum((l) => l.lineSubtotal),
    discountTotal: sum((l) => l.lineDiscount),
    vatTotal: sum((l) => l.lineVat),
    grandTotal: sum((l) => l.lineTotal),
    costTotal: sum((l) => l.quantity * l.unitCost),
  };
}

export type CreateReturnInput = {
  saleId: string;
  lines: ReturnLineInput[];
  refunds: RefundInput[];
  reason: string;
  /** Saleable goods go back on the shelf; damaged ones are written off instead. */
  restock: boolean;
  registerId: string | null;
  shiftId: string | null;
  user: { id: string; name: string };
  today: string;
};

export async function createReturn(input: CreateReturnInput) {
  const sale = await db.posSale.findUnique({
    where: { id: input.saleId },
    select: { id: true, number: true, branchId: true, status: true, grandTotal: true, refundedTotal: true },
  });
  if (!sale) throw new BusinessError("Sale not found.");
  if (sale.status === "PARKED") throw new BusinessError("This sale is still on hold — nothing has been paid to refund.");
  if (sale.status === "VOIDED") throw new BusinessError("This sale was voided; there is nothing to return.");
  if (sale.status === "REFUNDED") throw new BusinessError("Everything on this sale has already been returned.");

  const quote = await quoteReturn(input.saleId, input.lines);

  const refunded = round2(input.refunds.reduce((total, refund) => total + num(refund.amount), 0));
  if (refunded !== quote.grandTotal) {
    throw new BusinessError(`The refund must come to ${quote.grandTotal}; it currently comes to ${refunded}.`);
  }
  const accounts = await db.paymentAccount.findMany({
    where: { id: { in: input.refunds.map((r) => r.paymentAccountId) }, isActive: true },
    select: { id: true },
  });
  for (const refund of input.refunds) {
    if (num(refund.amount) <= 0) throw new BusinessError("Each refund must be more than 0.");
    if (!accounts.some((a) => a.id === refund.paymentAccountId)) throw new BusinessError("Choose an active account for every refund.");
  }

  const date = new Date(`${input.today}T00:00:00.000Z`);

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "POS_RETURN", new Date());

    const created = await tx.posReturn.create({
      data: {
        number,
        saleId: sale.id,
        branchId: sale.branchId,
        registerId: input.registerId,
        shiftId: input.shiftId,
        date,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        vatTotal: quote.vatTotal,
        grandTotal: quote.grandTotal,
        costTotal: quote.costTotal,
        reason: input.reason,
        restock: input.restock,
        userId: input.user.id,
        userName: input.user.name,
        items: {
          create: quote.lines.map((line, index) => ({
            saleItemId: line.saleItemId,
            variantId: line.variantId,
            name: line.name,
            sku: line.sku,
            unit: line.unit,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            unitCost: line.unitCost,
            discountPercent: line.discountPercent,
            vatRate: line.vatRate,
            lineSubtotal: line.lineSubtotal,
            lineDiscount: line.lineDiscount,
            lineVat: line.lineVat,
            lineTotal: line.lineTotal,
            restocked: input.restock && line.movedStock,
            sortOrder: index,
          })),
        },
      },
    });

    for (const line of quote.lines) {
      // Commission follows the money: a refunded service is no longer owed.
      await reverseLineCommission(tx, { saleItemId: line.saleItemId, portion: line.soldQuantity > 0 ? line.quantity / line.soldQuantity : 0 });
      // The sale line is what caps any later return of the same item.
      await tx.posSaleItem.update({
        where: { id: line.saleItemId },
        data: { returnedQuantity: { increment: line.quantity } },
      });

      // A returned service gives its membership sessions back, in proportion to what came back,
      // whether or not any goods were restocked. A returned ticket frees its place the same way.
      const portion = line.soldQuantity > 0 ? line.quantity / line.soldQuantity : 0;
      await returnMembershipUse(tx, line.saleItemId, portion);
      await returnTickets(tx, line.saleItemId, portion);

      if (input.restock) {
        /**
         * A dish put its ingredients into the plate, so returning part of it puts back that share
         * of what the line actually consumed — read from the line's own snapshot, so a recipe
         * changed since the sale cannot distort it.
         */
        await returnIngredients(tx, {
          saleItemId: line.saleItemId,
          portion: line.soldQuantity > 0 ? line.quantity / line.soldQuantity : 0,
          branchId: sale.branchId,
          reference: number,
          referenceId: created.id,
          referenceType: "POS_RETURN",
          note: input.reason,
          user: input.user,
        });
      }

      if (input.restock && line.movedStock && line.variantId) {
        await applyStockMovement(tx, {
          variantId: line.variantId,
          branchId: sale.branchId,
          kind: "SALE_RETURN",
          quantity: line.quantity,
          unitCost: line.unitCost,
          referenceType: "POS_RETURN",
          referenceId: created.id,
          reference: number,
          note: input.reason,
          userId: input.user.id,
          userName: input.user.name,
        });
      }
    }

    // Negative payments: money out through the same rows money came in on.
    for (const refund of input.refunds) {
      await tx.posPayment.create({
        data: {
          saleId: sale.id,
          returnId: created.id,
          method: refund.method,
          paymentAccountId: refund.paymentAccountId,
          amount: -round2(num(refund.amount)),
          reference: refund.reference ?? null,
          date,
        },
      });
    }

    const refundedTotal = round2(num(sale.refundedTotal) + quote.grandTotal);
    const fully = refundedTotal >= round2(num(sale.grandTotal));
    await tx.posSale.update({
      where: { id: sale.id },
      data: { refundedTotal, status: fully ? "REFUNDED" : "PARTIALLY_REFUNDED" },
    });

    return { id: created.id, number, saleNumber: sale.number, grandTotal: quote.grandTotal, fully };
  });
}
