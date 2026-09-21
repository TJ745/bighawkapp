// Date-only helpers. Document dates (invoice date, due date…) are calendar dates stored
// as Postgres DATE; they travel as "YYYY-MM-DD" strings and never carry a time zone.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" → Date at UTC midnight (what Prisma expects for @db.Date). */
export function parseDateOnly(value: string): Date {
  if (!DATE_ONLY.test(value)) throw new Error(`Invalid date: ${value}`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${value}`);
  return d;
}

/** Date (UTC midnight) → "YYYY-MM-DD". */
export function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Today's calendar date in the given time zone, as "YYYY-MM-DD". */
export function todayInTimeZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(value: string, days: number): string {
  const d = parseDateOnly(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateOnly(d);
}

export function isDateOnly(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY.test(value);
}
