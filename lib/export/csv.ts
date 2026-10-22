/**
 * CSV for spreadsheets.
 *
 * Pure and client-safe, so the same serialiser could run either side. Three details decide whether
 * a file actually opens correctly in Excel, and all three are easy to get wrong:
 *
 *  - **A byte-order mark.** Without it Excel reads UTF-8 as the local code page and Arabic names
 *    arrive as mojibake. Currency is SAR and customers have Arabic names, so this is not optional.
 *  - **Formula injection.** Excel treats a cell beginning `=`, `+`, `-`, `@`, tab or carriage return
 *    as a formula. A supplier literally named `=1+1` is a nuisance; one named to call a shell is an
 *    attack on whoever opens the file. Such values are neutralised, not trusted.
 *  - **Numbers and dates as data.** Money is written as a plain decimal and dates as `YYYY-MM-DD`,
 *    never with thousands separators or a localised format, so a spreadsheet can sum and sort them.
 *    Display formatting belongs on screen; a spreadsheet wants the value.
 */

/** Excel and most spreadsheets expect CRLF in a .csv. */
const ROW_SEPARATOR = "\r\n";

/**
 * U+FEFF. Prepended so a spreadsheet recognises UTF-8 — the difference between "مؤسسة" and
 * "Ù…Ø¤Ø³Ø³Ø©" when the file is double-clicked.
 */
export const UTF8_BOM = "﻿";

/** Characters that make a spreadsheet treat a cell as a formula rather than text. */
const FORMULA_STARTERS = ["=", "+", "-", "@", "\t", "\r"];

/**
 * One cell.
 *
 * A value that would be read as a formula is prefixed with an apostrophe, which spreadsheets strip
 * on display — so the cell reads as written and executes nothing. Quoting alone does **not** prevent
 * this, which is the trap: `"=1+1"` is still a formula to Excel.
 */
export function csvCell(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return "";

  let text: string;
  if (value instanceof Date) {
    text = value.toISOString().slice(0, 10);
  } else if (typeof value === "number") {
    // NaN or Infinity in a spreadsheet is worse than an empty cell, which at least sums.
    text = Number.isFinite(value) ? String(value) : "";
  } else if (typeof value === "boolean") {
    text = value ? "Yes" : "No";
  } else {
    text = value;
  }

  if (text === "") return "";

  /**
   * Only *text* is neutralised.
   *
   * A number we formatted ourselves is not user input, and −50 begins with a character a
   * spreadsheet would execute — so neutralising it indiscriminately would turn every refund and
   * every credit into a string, and the column would stop adding up. A string that merely looks
   * like a number is still text, and is still neutralised.
   */
  const neutralised = typeof value === "string" && FORMULA_STARTERS.some((c) => text.startsWith(c)) ? `'${text}` : text;
  // Quote whenever the cell could otherwise break the row, and double any quote inside it.
  return /[",\r\n]/.test(neutralised) ? `"${neutralised.replace(/"/g, '""')}"` : neutralised;
}

/** A column: its heading, and how to read it off a row. */
export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number | boolean | Date | null | undefined;
};

/** Serialises rows into a complete CSV file, byte-order mark included. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((column) => csvCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(column.value(row))).join(","));
  }
  return UTF8_BOM + lines.join(ROW_SEPARATOR) + ROW_SEPARATOR;
}

/**
 * A filename that says what the file is and when it was taken.
 *
 * Exports are downloaded repeatedly, so "invoices.csv (3)" is worse than useless — the date is what
 * tells two downloads apart a week later.
 */
export function csvFilename(subject: string, today: string): string {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "export"}-${today}.csv`;
}

/**
 * How many rows one export may carry.
 *
 * A Server Action answers with the whole file in memory, so this is a real limit rather than a
 * guess. It is generous enough for years of documents, and the caller tells the user to narrow the
 * filter instead of silently handing back a truncated file — a short export that looks complete is
 * the worst outcome.
 */
export const CSV_ROW_LIMIT = 20000;
