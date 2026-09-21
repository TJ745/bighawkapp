import type { DateFormat, NumberFormat } from "@/lib/settings/defaults";

// Display formatting. Currency is always SAR (single-currency app).
// Every screen formats through these helpers so Settings → Date & Regional applies everywhere:
// server code uses getFormatters() (lib/settings/formatters.ts), client code uses useFormat().

export const CURRENCY = "SAR";

export type RegionalSettings = {
  dateFormat: DateFormat;
  timeZone: string;
  numberFormat: NumberFormat;
};

export const DEFAULT_REGIONAL: RegionalSettings = {
  dateFormat: "DD/MM/YYYY",
  timeZone: "Asia/Riyadh",
  numberFormat: "1,234.56",
};

const LOCALE_BY_NUMBER_FORMAT: Record<NumberFormat, string> = {
  "1,234.56": "en-US",
  "1.234,56": "de-DE",
  "1 234,56": "fr-FR",
};

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type Formatters = ReturnType<typeof createFormatters>;

export function createFormatters(regional: RegionalSettings = DEFAULT_REGIONAL) {
  const locale = LOCALE_BY_NUMBER_FORMAT[regional.numberFormat] ?? "en-US";
  const numberFmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const intFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const partsFmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: safeTimeZone(regional.timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  function dateParts(d: Date) {
    const parts = Object.fromEntries(partsFmt.formatToParts(d).map((p) => [p.type, p.value]));
    return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour === "24" ? "00" : parts.hour, minute: parts.minute };
  }

  function date(value: Date | string | null | undefined) {
    const d = toDate(value);
    if (!d) return "—";
    const { year, month, day } = dateParts(d);
    switch (regional.dateFormat) {
      case "MM/DD/YYYY":
        return `${month}/${day}/${year}`;
      case "YYYY-MM-DD":
        return `${year}-${month}-${day}`;
      case "DD MMM YYYY":
        return `${day} ${MONTHS_SHORT[Number(month) - 1]} ${year}`;
      default:
        return `${day}/${month}/${year}`;
    }
  }

  function dateTime(value: Date | string | null | undefined) {
    const d = toDate(value);
    if (!d) return "—";
    const { hour, minute } = dateParts(d);
    return `${date(d)} ${hour}:${minute}`;
  }

  return {
    regional,
    /** "SAR 1,234.50" */
    money: (value: number | string | null | undefined) => `${CURRENCY} ${numberFmt.format(toNumber(value))}`,
    /** "1,234.50" (no currency) */
    number: (value: number | string | null | undefined) => numberFmt.format(toNumber(value)),
    integer: (value: number | string | null | undefined) => intFmt.format(toNumber(value)),
    /** "15.00%" */
    percent: (value: number | string | null | undefined) => `${numberFmt.format(toNumber(value))}%`,
    date,
    dateTime,
  };
}

// Default-settings formatters for places that cannot receive settings (fallbacks only).
const defaults = createFormatters();
export const formatMoney = defaults.money;
export const formatNumber = defaults.number;
export const formatDate = defaults.date;
export const formatDateTime = defaults.dateTime;

export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : d;
}

function safeTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_REGIONAL.timeZone;
  }
}

/**
 * Short "time ago" label for feeds (notification dropdown). Deliberately not settings-driven:
 * it is a relative hint, not a formatted date — the full date still uses the regional formatters.
 */
export function formatRelativeTime(value: Date | string, now: Date = new Date()) {
  const date = toDate(value);
  if (!date) return "";
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.max(1, Math.floor(days / 30))}mo ago`;
}

export function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
