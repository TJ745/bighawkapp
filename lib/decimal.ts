// Prisma Decimal → number for values crossing to client components / formatting.
// Money is stored as Decimal(14,2), so converting to a JS number is safe for display and 2-dp arithmetic.
export function num(value: { toNumber(): number } | number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return value.toNumber();
}
