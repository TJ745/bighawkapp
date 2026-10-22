/**
 * The ZATCA invoice QR code — Phase 1 ("Generation").
 *
 * The QR on a Saudi tax invoice is **not** a URL. It is a base64 string whose bytes are a sequence
 * of TLV (tag–length–value) records, which ZATCA's own verification app decodes and reads back.
 * Phase 1 defines five mandatory records; Phase 2 adds four more (the invoice hash, the signature
 * and the public key), which is why the tag numbers are named rather than written inline.
 *
 * Everything here is pure and client-safe: the till builds the payload for the receipt it is about
 * to print, and the server builds the same payload for the PDF. One implementation, so the two can
 * never disagree.
 */

/** TLV tag numbers. 1–5 are Phase 1; 6–9 are reserved for Phase 2's cryptographic records. */
export const ZatcaQrTag = {
  SELLER_NAME: 1,
  VAT_NUMBER: 2,
  TIMESTAMP: 3,
  TOTAL_WITH_VAT: 4,
  VAT_TOTAL: 5,
} as const;

/**
 * A TLV length is a single byte, so no value may exceed 255 **bytes**. That is bytes, not
 * characters: an Arabic company name costs two bytes per letter, which is exactly the kind of
 * detail that turns into an unscannable invoice if it is measured in `String.length`.
 */
const MAX_VALUE_BYTES = 255;

const encoder = new TextEncoder();

/** Cuts a string to fit `maxBytes` of UTF-8 without splitting a character in half. */
function truncateToBytes(value: string, maxBytes: number): string {
  if (encoder.encode(value).length <= maxBytes) return value;
  // Walk by code point (not by UTF-16 unit) so a surrogate pair is never severed.
  let result = "";
  let used = 0;
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (used + size > maxBytes) break;
    result += char;
    used += size;
  }
  return result;
}

/** One TLV record: the tag, the value's byte length, then the value as UTF-8. */
export function encodeTlv(tag: number, value: string): Uint8Array {
  if (!Number.isInteger(tag) || tag < 1 || tag > 255) throw new Error(`Invalid TLV tag: ${tag}`);
  const bytes = encoder.encode(truncateToBytes(value, MAX_VALUE_BYTES));
  const record = new Uint8Array(bytes.length + 2);
  record[0] = tag;
  record[1] = bytes.length;
  record.set(bytes, 2);
  return record;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64 over raw bytes, written out rather than borrowed, because this module runs both in the
 * browser (no `Buffer`) and on the server (no `btoa` on binary strings without a lossy round trip).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/[^A-Za-z0-9+/]/g, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let outIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(clean[i]);
    const c1 = BASE64_ALPHABET.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === undefined ? -1 : BASE64_ALPHABET.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === undefined ? -1 : BASE64_ALPHABET.indexOf(clean[i + 3]);
    out[outIndex++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[outIndex++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (c3 >= 0) out[outIndex++] = ((c2 & 0x03) << 6) | c3;
  }
  return out.subarray(0, outIndex);
}

/**
 * The timestamp ZATCA expects: ISO 8601 to the second, in Zulu, with no milliseconds.
 *
 * Document dates in this app are calendar dates stored at UTC midnight (see `lib/dates.ts`), so an
 * invoice dated the 12th reads as `2026-10-12T00:00:00Z` — the calendar day on the invoice and the
 * day in the QR are the same day, which is what a verifier compares.
 */
export function zatcaTimestamp(value: Date): string {
  return `${value.toISOString().slice(0, 19)}Z`;
}

/** Amounts go in as plain decimals to two places — no grouping, no currency, dot as separator. */
export function zatcaAmount(value: number): string {
  // Negative zero would print "-0.00"; a document total is never meaningfully negative here.
  const safe = Object.is(value, -0) ? 0 : value;
  return safe.toFixed(2);
}

export type Phase1QrInput = {
  /** The seller's legal name, in Arabic where the company has registered one. */
  sellerName: string;
  /** The seller's 15-digit VAT registration number. */
  vatNumber: string;
  /** When the document was issued. */
  issuedAt: Date;
  /** The total the customer pays, VAT included. */
  totalWithVat: number;
  /** The VAT within that total. */
  vatTotal: number;
};

/**
 * Builds the Phase 1 QR payload: the base64 string that goes into the QR image.
 *
 * The five records are written in tag order, which is how every decoder expects to read them.
 */
export function buildPhase1QrPayload(input: Phase1QrInput): string {
  const records = [
    encodeTlv(ZatcaQrTag.SELLER_NAME, input.sellerName.trim()),
    encodeTlv(ZatcaQrTag.VAT_NUMBER, input.vatNumber.trim()),
    encodeTlv(ZatcaQrTag.TIMESTAMP, zatcaTimestamp(input.issuedAt)),
    encodeTlv(ZatcaQrTag.TOTAL_WITH_VAT, zatcaAmount(input.totalWithVat)),
    encodeTlv(ZatcaQrTag.VAT_TOTAL, zatcaAmount(input.vatTotal)),
  ];
  return bytesToBase64(concatBytes(records));
}

/**
 * Reads a payload back into its records.
 *
 * This is here so a QR can be checked without ZATCA's phone app — the same way a document number
 * can be read back off a document. It is also what the tests assert against.
 */
export function decodeQrPayload(payload: string): { tag: number; value: string }[] {
  const bytes = base64ToBytes(payload);
  const decoder = new TextDecoder();
  const records: { tag: number; value: string }[] = [];
  let i = 0;
  while (i + 2 <= bytes.length) {
    const tag = bytes[i];
    const length = bytes[i + 1];
    const start = i + 2;
    if (start + length > bytes.length) break; // truncated payload: stop rather than invent a value
    records.push({ tag, value: decoder.decode(bytes.subarray(start, start + length)) });
    i = start + length;
  }
  return records;
}
