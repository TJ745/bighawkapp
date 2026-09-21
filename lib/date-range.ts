// Date-range presets shared by the DateRangeFilter (client) and pages (server).
export type DatePreset = "all" | "today" | "this-month" | "last-month" | "this-year" | "custom";

export const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom range" },
];

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

/** Preset → { from, to } as "YYYY-MM-DD", based on today's calendar date in the company time zone. */
export function presetRange(preset: DatePreset, today: string): { from: string | null; to: string | null } {
  const [y, m] = today.split("-").map(Number);
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "this-month":
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last(y, m))}` };
    case "last-month": {
      const ly = m === 1 ? y - 1 : y;
      const lm = m === 1 ? 12 : m - 1;
      return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(last(ly, lm))}` };
    }
    case "this-year":
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    default:
      return { from: null, to: null };
  }
}

/**
 * Trailing window ending today — used by dashboard charts, which show a trend rather than
 * the period the figures above them cover. Months start on the 1st so buckets are whole months.
 */
export function trailingRange(today: string, unit: "months" | "days", count: number): { from: string; to: string } {
  const [y, m, d] = today.split("-").map(Number);
  const start = unit === "days" ? new Date(Date.UTC(y, m - 1, d - (count - 1))) : new Date(Date.UTC(y, m - count, 1));
  return { from: start.toISOString().slice(0, 10), to: today };
}

export function detectPreset(from: string, to: string, today: string): DatePreset {
  if (!from && !to) return "all";
  for (const p of ["today", "this-month", "last-month", "this-year"] as const) {
    const r = presetRange(p, today);
    if (r.from === from && r.to === to) return p;
  }
  return "custom";
}

/** Resolves the effective range for a page from its search params (?from, ?to, ?range=all) and default preset. */
export function resolveRange(
  raw: { from?: string | string[]; to?: string | string[]; range?: string | string[] },
  today: string,
  defaultPreset: DatePreset,
): { from: string | null; to: string | null } {
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const from = pick(raw.from);
  const to = pick(raw.to);
  if (DATE_ONLY.test(from) || DATE_ONLY.test(to)) {
    return { from: DATE_ONLY.test(from) ? from : null, to: DATE_ONLY.test(to) ? to : null };
  }
  if (pick(raw.range) === "all") return { from: null, to: null };
  return presetRange(defaultPreset, today);
}
