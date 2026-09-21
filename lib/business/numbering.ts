import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { DocumentType } from "@/lib/generated/prisma/enums";
import { DOCUMENT_TYPES } from "@/lib/settings/defaults";
import { formatDocumentNumber } from "./document-number";

type SequenceRow = {
  id: string;
  prefix: string;
  startingNumber: number;
  nextNumber: number;
  includeYear: boolean;
  currentYear: number | null;
};

/**
 * Allocates the next document number for a type. Must be called inside the same
 * transaction that creates the document, so the number is rolled back if the insert fails.
 * The sequence row is locked (SELECT ... FOR UPDATE), so concurrent callers never get duplicates.
 */
export async function nextDocumentNumber(tx: Prisma.TransactionClient, type: DocumentType, date = new Date()) {
  const year = date.getFullYear();

  let [row] = await tx.$queryRaw<SequenceRow[]>`
    SELECT "id", "prefix", "startingNumber", "nextNumber", "includeYear", "currentYear"
    FROM "DocumentSequence" WHERE "type" = ${type}::"DocumentType" FOR UPDATE`;

  if (!row) {
    // First use before Settings were ever opened: create the row with defaults, then lock it.
    const defaults = DOCUMENT_TYPES.find((d) => d.type === type)!;
    await tx.documentSequence.createMany({
      data: [{ type, prefix: defaults.prefix, startingNumber: 1, nextNumber: 1, includeYear: true }],
      skipDuplicates: true,
    });
    [row] = await tx.$queryRaw<SequenceRow[]>`
      SELECT "id", "prefix", "startingNumber", "nextNumber", "includeYear", "currentYear"
      FROM "DocumentSequence" WHERE "type" = ${type}::"DocumentType" FOR UPDATE`;
  }

  // When the year is part of the number, the counter restarts each year.
  const restart = row.includeYear && row.currentYear !== null && row.currentYear !== year;
  const number = restart ? row.startingNumber : row.nextNumber;

  await tx.documentSequence.update({
    where: { id: row.id },
    data: { nextNumber: number + 1, currentYear: row.includeYear ? year : null },
  });

  return formatDocumentNumber(row.prefix, row.includeYear, year, number);
}
