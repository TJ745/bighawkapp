import "server-only";
import { db, type Tx } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import type { StockMovementKind } from "@/lib/generated/prisma/enums";

/**
 * The only place a stock level is ever written.
 *
 * Every caller — POS sale, purchase receipt, return, manual count, branch transfer — goes through
 * applyStockMovement(), which updates the level and appends the movement that explains it inside
 * the same transaction. Nothing else may touch StockLevel: a second implementation is how stock
 * and its history drift apart.
 */

/** Quantities are Decimal(14,3); rounding here keeps weighed goods exact to the gram. */
export function round3(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export type StockMovementInput = {
  variantId: string;
  branchId: string;
  kind: StockMovementKind;
  /** Signed delta: positive adds stock, negative removes it. */
  quantity: number;
  unitCost?: number | null;
  referenceType?: string | null;
  referenceId?: string | null;
  reference?: string | null;
  note?: string | null;
  userId?: string | null;
  userName: string;
  /** Only a correction may knowingly drive a level below zero; selling may not. */
  allowNegative?: boolean;
};


/**
 * Applies one stock change. Must run inside a transaction so the level, the movement and whatever
 * document caused it either all land or none do.
 */
export async function applyStockMovement(tx: Tx, input: StockMovementInput) {
  const quantity = round3(input.quantity);
  if (quantity === 0) return null;

  const variant = await tx.itemVariant.findUnique({
    where: { id: input.variantId },
    select: { id: true, name: true, item: { select: { name: true, trackStock: true, kind: true } } },
  });
  if (!variant) throw new BusinessError("This product variant no longer exists.");
  // Services and non-stocked products have no levels to move; silently skipping would hide a bug.
  if (!variant.item.trackStock) {
    throw new BusinessError(`${variant.item.name} is not stock-tracked, so its stock cannot change.`);
  }

  const level = await tx.stockLevel.upsert({
    where: { variantId_branchId: { variantId: input.variantId, branchId: input.branchId } },
    create: { variantId: input.variantId, branchId: input.branchId, quantity },
    update: { quantity: { increment: quantity } },
  });

  const balanceAfter = round3(num(level.quantity));
  if (balanceAfter < 0 && !input.allowNegative) {
    const available = round3(balanceAfter - quantity);
    throw new BusinessError(
      `Not enough stock for ${variant.item.name}${variant.name && variant.name !== variant.item.name ? ` (${variant.name})` : ""}: ${available} available.`,
    );
  }

  return tx.stockMovement.create({
    data: {
      variantId: input.variantId,
      branchId: input.branchId,
      kind: input.kind,
      quantity,
      balanceAfter,
      unitCost: input.unitCost ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      userId: input.userId ?? null,
      userName: input.userName,
    },
  });
}

/** Several movements in one transaction, for a document with many lines. */
export async function applyStockMovements(tx: Tx, movements: StockMovementInput[]) {
  for (const movement of movements) {
    await applyStockMovement(tx, movement);
  }
}

/**
 * Sets a level to a counted quantity, recording the difference as an adjustment. This is what a
 * stock count does: the user knows what is on the shelf, not what the delta should be.
 */
export async function setStockLevel(input: {
  variantId: string;
  branchId: string;
  countedQuantity: number;
  note?: string | null;
  userId?: string | null;
  userName: string;
}) {
  const counted = round3(input.countedQuantity);
  if (counted < 0) throw new BusinessError("A counted quantity cannot be negative.");

  return db.$transaction(async (tx) => {
    const current = await tx.stockLevel.findUnique({
      where: { variantId_branchId: { variantId: input.variantId, branchId: input.branchId } },
      select: { quantity: true },
    });
    const delta = round3(counted - round3(num(current?.quantity ?? 0)));
    if (delta === 0) return { changed: false, delta: 0, balance: counted };

    await applyStockMovement(tx, {
      variantId: input.variantId,
      branchId: input.branchId,
      kind: "ADJUSTMENT",
      quantity: delta,
      note: input.note ?? null,
      referenceType: "STOCK_COUNT",
      userId: input.userId,
      userName: input.userName,
      // The count is the truth; it can only land on a non-negative number anyway.
      allowNegative: false,
    });
    return { changed: true, delta, balance: counted };
  });
}

/** Adds or removes stock by a delta — receiving without a purchase document, damage, loss. */
export async function adjustStock(input: {
  variantId: string;
  branchId: string;
  delta: number;
  kind?: StockMovementKind;
  note?: string | null;
  unitCost?: number | null;
  userId?: string | null;
  userName: string;
}) {
  if (round3(input.delta) === 0) throw new BusinessError("Enter a quantity to add or remove.");
  return db.$transaction((tx) =>
    applyStockMovement(tx, {
      variantId: input.variantId,
      branchId: input.branchId,
      kind: input.kind ?? "ADJUSTMENT",
      quantity: input.delta,
      unitCost: input.unitCost ?? null,
      note: input.note ?? null,
      referenceType: "ADJUSTMENT",
      userId: input.userId,
      userName: input.userName,
    }),
  );
}

/** Moves stock between branches as a matched pair, so the two sides can never disagree. */
export async function transferStock(input: {
  variantId: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  note?: string | null;
  userId?: string | null;
  userName: string;
}) {
  const quantity = round3(input.quantity);
  if (quantity <= 0) throw new BusinessError("Enter a quantity to transfer.");
  if (input.fromBranchId === input.toBranchId) throw new BusinessError("Choose two different branches.");

  return db.$transaction(async (tx) => {
    await applyStockMovement(tx, {
      variantId: input.variantId,
      branchId: input.fromBranchId,
      kind: "TRANSFER_OUT",
      quantity: -quantity,
      note: input.note ?? null,
      referenceType: "TRANSFER",
      userId: input.userId,
      userName: input.userName,
    });
    await applyStockMovement(tx, {
      variantId: input.variantId,
      branchId: input.toBranchId,
      kind: "TRANSFER_IN",
      quantity,
      note: input.note ?? null,
      referenceType: "TRANSFER",
      userId: input.userId,
      userName: input.userName,
    });
  });
}

/** Current quantity of one variant at one branch. */
export async function getStockLevel(variantId: string, branchId: string) {
  const level = await db.stockLevel.findUnique({
    where: { variantId_branchId: { variantId, branchId } },
    select: { quantity: true },
  });
  return round3(num(level?.quantity ?? 0));
}

/** Quantities for many variants at one branch, keyed by variant id — for lists and the register. */
export async function getStockLevels(variantIds: string[], branchId: string) {
  if (variantIds.length === 0) return new Map<string, number>();
  const levels = await db.stockLevel.findMany({
    where: { branchId, variantId: { in: variantIds } },
    select: { variantId: true, quantity: true },
  });
  return new Map(levels.map((l) => [l.variantId, round3(num(l.quantity))]));
}
