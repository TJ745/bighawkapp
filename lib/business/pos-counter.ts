import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Collection numbers — the "Order 42" a quick-service counter calls out.
 *
 * They are not document numbers: they restart every morning, belong to one branch, and mean
 * nothing after the day is over. The row for the day is locked (`SELECT … FOR UPDATE`) exactly as
 * document numbering locks its sequence, so two tills can never call out the same number.
 */
export async function nextOrderNumber(tx: Prisma.TransactionClient, branchId: string, date: string) {
  const day = new Date(`${date}T00:00:00.000Z`);

  type Row = { id: string; next: number };
  let [row] = await tx.$queryRaw<Row[]>`
    SELECT "id", "next" FROM "PosOrderCounter"
    WHERE "branchId" = ${branchId} AND "date" = ${day}::date FOR UPDATE`;

  if (!row) {
    // First order of the day. `skipDuplicates` covers the till that got here a moment earlier.
    await tx.posOrderCounter.createMany({ data: [{ branchId, date: day, next: 1 }], skipDuplicates: true });
    [row] = await tx.$queryRaw<Row[]>`
      SELECT "id", "next" FROM "PosOrderCounter"
      WHERE "branchId" = ${branchId} AND "date" = ${day}::date FOR UPDATE`;
  }

  await tx.posOrderCounter.update({ where: { id: row.id }, data: { next: row.next + 1 } });
  return row.next;
}
