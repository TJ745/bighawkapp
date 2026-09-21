import "server-only";
import { db } from "@/lib/db";
import type { FinanceCategoryKind } from "@/lib/generated/prisma/enums";
import { num } from "@/lib/decimal";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/settings/defaults";
import { fileUrl } from "@/lib/storage";

/** Categories for a kind; the defaults are created on first use. Custom ones are added from the entry forms. */
export async function listFinanceCategories(kind: FinanceCategoryKind) {
  const count = await db.financeCategory.count({ where: { kind } });
  if (count === 0) {
    const names = kind === "INCOME" ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES;
    await db.financeCategory.createMany({ data: names.map((name) => ({ kind, name, isDefault: true })), skipDuplicates: true });
  }
  return db.financeCategory.findMany({
    where: { kind, isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: { id: true, name: true, isDefault: true },
  });
}

export type FinanceCategoryOption = Awaited<ReturnType<typeof listFinanceCategories>>[number];

function mapEntry<T extends { amount: unknown; attachmentKey: string | null; attachmentName: string | null; attachmentSize: number | null }>(row: T) {
  return {
    ...row,
    amount: num(row.amount as number),
    attachment:
      row.attachmentKey && row.attachmentName
        ? { name: row.attachmentName, url: fileUrl(row.attachmentKey), size: row.attachmentSize ?? 0 }
        : null,
  };
}

export async function getOtherIncome(id: string) {
  const row = await db.otherIncome.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } }, paymentAccount: { select: { id: true, name: true } } },
  });
  return row ? mapEntry(row) : null;
}

export async function getExpense(id: string) {
  const row = await db.expense.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } }, paymentAccount: { select: { id: true, name: true } } },
  });
  return row ? mapEntry(row) : null;
}

export type FinanceEntryDetail = NonNullable<Awaited<ReturnType<typeof getOtherIncome>>>;
