import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { applyStockMovement, round3 } from "./inventory";
import { nextDocumentNumber } from "./numbering";
import { round2 } from "./totals";

/**
 * Rentals: something lent out and expected back.
 *
 * Stock leaves the shelf when it goes out and comes back when it returns, through the one engine
 * that may write a stock level. The money is ordinary POS sales — the days agreed up front, and a
 * second sale for late days if there are any — so a rental never becomes a second kind of invoice.
 */

/** Whole days late, counting the day it was due as still fine. */
export function daysLate(dueAt: Date, returnedAt: Date) {
  const due = Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth(), dueAt.getUTCDate());
  const back = Date.UTC(returnedAt.getUTCFullYear(), returnedAt.getUTCMonth(), returnedAt.getUTCDate());
  return Math.max(0, Math.round((back - due) / (24 * 60 * 60_000)));
}

export function lateFeeFor(dailyRate: number, quantity: number, late: number) {
  return round2(dailyRate * quantity * late);
}

export type TakeOutInput = {
  branchId: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  variantId: string;
  quantity: number;
  days: number;
  dailyRate: number | null;
  deposit: number;
  note: string | null;
  user: { id: string; name: string };
};

/**
 * Lends something out. The stock moves here, inside the same transaction that writes the
 * agreement, so a shelf never says something is in when the paperwork says it is out.
 */
export async function takeOut(input: TakeOutInput) {
  const variant = await db.itemVariant.findUnique({
    where: { id: input.variantId },
    include: { item: { select: { name: true, kind: true, trackStock: true, salePrice: true, isActive: true } } },
  });
  if (!variant) throw new BusinessError("That item no longer exists.");
  if (!variant.isActive || !variant.item.isActive) throw new BusinessError(`${variant.item.name} is no longer available.`);
  if (input.quantity <= 0) throw new BusinessError("How many are going out?");
  if (input.days <= 0) throw new BusinessError("A rental runs for at least a day.");

  const quantity = round3(input.quantity);
  const rate = input.dailyRate ?? num(variant.item.salePrice);
  const name = variant.name && variant.name !== variant.item.name ? `${variant.item.name} — ${variant.name}` : variant.item.name;
  const due = new Date(Date.now() + input.days * 24 * 60 * 60_000);

  return db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "RENTAL", new Date());
    const rental = await tx.rental.create({
      data: {
        number,
        branchId: input.branchId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        variantId: variant.id,
        itemName: name,
        quantity,
        dailyRate: rate,
        deposit: input.deposit,
        dueAt: due,
        note: input.note,
        createdById: input.user.id,
        createdByName: input.user.name,
      },
      select: { id: true, number: true, dueAt: true },
    });

    // Tracked kit leaves the shelf now; a service or an untracked item has no shelf to leave.
    if (variant.item.trackStock && variant.item.kind === "PRODUCT") {
      await applyStockMovement(tx, {
        variantId: variant.id,
        branchId: input.branchId,
        kind: "RENTAL_OUT",
        quantity: -quantity,
        unitCost: 0,
        referenceType: "RENTAL_OUT",
        referenceId: rental.id,
        reference: rental.number,
        note: "Out on rental",
        userId: input.user.id,
        userName: input.user.name,
      });
    }

    return { id: rental.id, number: rental.number, dueAt: rental.dueAt, itemName: name, dailyRate: rate, days: input.days };
  });
}

/**
 * Takes it back. Stock returns to the shelf and the late days are worked out, but no money moves
 * here: a late fee is charged at the till like anything else, and `settledSaleId` records that.
 */
export async function takeBack(input: { rentalId: string; branchId: string; lost: boolean; user: { id: string; name: string } }) {
  const rental = await db.rental.findUnique({ where: { id: input.rentalId } });
  if (!rental) throw new BusinessError("That rental no longer exists.");
  if (rental.branchId !== input.branchId) throw new BusinessError("That rental belongs to another branch.");
  if (rental.status === "RETURNED" || rental.status === "LOST") throw new BusinessError("That rental is already closed.");

  const now = new Date();
  const late = daysLate(rental.dueAt, now);
  const fee = input.lost ? 0 : lateFeeFor(num(rental.dailyRate), num(rental.quantity), late);

  const variant = rental.variantId
    ? await db.itemVariant.findUnique({ where: { id: rental.variantId }, select: { item: { select: { trackStock: true, kind: true } } } })
    : null;

  await db.$transaction(async (tx) => {
    // Something lost never comes back to the shelf; something returned does.
    if (!input.lost && variant?.item.trackStock && variant.item.kind === "PRODUCT" && rental.variantId) {
      await applyStockMovement(tx, {
        variantId: rental.variantId,
        branchId: rental.branchId,
        kind: "RENTAL_IN",
        quantity: num(rental.quantity),
        unitCost: 0,
        referenceType: "RENTAL_IN",
        referenceId: rental.id,
        reference: rental.number,
        note: "Back from rental",
        userId: input.user.id,
        userName: input.user.name,
      });
    }

    await tx.rental.update({
      where: { id: rental.id },
      data: { status: input.lost ? "LOST" : "RETURNED", returnedAt: now, lateFee: fee },
    });
  });

  return { number: rental.number, itemName: rental.itemName, daysLate: late, lateFee: fee, lost: input.lost };
}

/** Marks what is out past its due date, run before reads like the other status sweeps. */
export async function refreshRentalStatuses() {
  await db.rental.updateMany({ where: { status: "OUT", dueAt: { lt: new Date() } }, data: { status: "OVERDUE" } });
}
