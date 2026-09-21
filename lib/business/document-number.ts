// Pure, client-safe formatting of document numbers, e.g. "INV-2026-0001".
export const DOCUMENT_NUMBER_PADDING = 4;

export function formatDocumentNumber(prefix: string, includeYear: boolean, year: number, number: number) {
  const padded = String(number).padStart(DOCUMENT_NUMBER_PADDING, "0");
  return includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}
