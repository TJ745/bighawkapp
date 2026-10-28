import "server-only";
import { db, type Tx } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import { round2 } from "./totals";

/**
 * Who performed a service, and what it earned them.
 *
 * Commission is worked out on what the customer actually paid for the line, **VAT excluded** —
 * commission on tax would pay staff out of the government's money. The rate and the amount are
 * snapshotted on the sale line, so changing someone's rate never rewrites what they are already
 * owed, and a void or a return reverses the amount rather than deleting the record.
 */

export type StaffRate = { id: string; name: string; commissionPercent: number };

/** The staff a sale may name, by id. Only active people at the branch can take a line. */
export async function getStaffRates(staffIds: (string | null | undefined)[], branchId: string): Promise<Map<string, StaffRate>> {
  const ids = [...new Set(staffIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const rows = await db.staffMember.findMany({
    where: { id: { in: ids }, branchId },
    select: { id: true, name: true, commissionPercent: true, isActive: true },
  });
  if (rows.length !== ids.length) throw new BusinessError("One of those staff members is not at this branch.");
  for (const row of rows) {
    if (!row.isActive) throw new BusinessError(`${row.name} is no longer working here.`);
  }
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, commissionPercent: num(row.commissionPercent) }]));
}

/** What a line earns: the rate applied to the line net of its discount, before VAT. */
export function commissionOn(lineNet: number, commissionPercent: number) {
  return round2((lineNet * Math.min(100, Math.max(0, commissionPercent))) / 100);
}

/** Records who performed one sold line and what it earned them. */
export async function recordLineStaff(
  tx: Tx,
  input: { saleItemId: string; staff: StaffRate; commissionPercent?: number | null; lineNet: number },
) {
  const rate = input.commissionPercent === undefined || input.commissionPercent === null ? input.staff.commissionPercent : input.commissionPercent;
  await tx.posSaleItemStaff.create({
    data: {
      saleItemId: input.saleItemId,
      staffId: input.staff.id,
      staffName: input.staff.name,
      commissionPercent: rate,
      amount: commissionOn(input.lineNet, rate),
    },
  });
}

/**
 * Takes back commission on a line that was voided or returned. `portion` is how much of the line
 * is coming back: 1 for a void, returned ÷ sold for a partial return. The row stays, with what was
 * reversed on it, because "earned then returned" is not the same story as "never earned".
 */
export async function reverseLineCommission(tx: Tx, input: { saleItemId: string; portion: number }) {
  if (input.portion <= 0) return;
  const rows = await tx.posSaleItemStaff.findMany({ where: { saleItemId: input.saleItemId } });
  for (const row of rows) {
    const alreadyReversed = num(row.reversedAmount);
    const reversal = Math.min(round2(num(row.amount) * Math.min(1, input.portion)), round2(num(row.amount) - alreadyReversed));
    if (reversal <= 0) continue;
    await tx.posSaleItemStaff.update({ where: { id: row.id }, data: { reversedAmount: round2(alreadyReversed + reversal) } });
  }
}
