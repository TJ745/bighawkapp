/**
 * Turning a QR payload into something drawable.
 *
 * The encoder gives a grid of dark and light modules. Everything that prints a QR here — the
 * invoice PDF (react-pdf) and the 80 mm receipt (HTML) — draws from that one grid, as a single SVG
 * path in a square viewBox. A path rather than an image because it stays sharp on a thermal printer
 * at any size, carries no base64 bitmap through a server-to-client boundary, and keeps the encoder
 * out of the browser bundle: the server renders the path, the client only draws it.
 */
import qrcode from "qrcode-generator";

export type QrPath = {
  /** The side of the viewBox in module units, quiet zone included. */
  size: number;
  /** An SVG path of one `M…h…v…h…z` square per dark module. */
  path: string;
};

/**
 * The quiet zone is part of the symbol, not decoration — a QR printed hard against receipt text
 * often will not scan. Four modules is the specified minimum.
 */
const QUIET_ZONE = 4;

/**
 * Error correction level M: the middle setting, and what ZATCA's own examples use. Higher
 * correction would survive more smudging but makes the symbol denser, which costs more on a
 * low-resolution thermal head than it gains.
 */
const ERROR_CORRECTION = "M" as const;

/**
 * Builds the drawable path for a payload.
 *
 * Type number 0 lets the encoder pick the smallest symbol that fits, so a short receipt payload
 * does not print a needlessly dense code. The payload is base64, therefore ASCII, so "Byte" mode
 * encodes it exactly as given.
 */
export function qrPath(payload: string): QrPath {
  const qr = qrcode(0, ERROR_CORRECTION);
  qr.addData(payload, "Byte");
  qr.make();

  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    // Dark modules in a row are merged into one rectangle, which cuts the path length roughly in
    // half. A shorter path matters: this string crosses to the client on every receipt.
    let runStart = -1;
    for (let col = 0; col <= count; col++) {
      const dark = col < count && qr.isDark(row, col);
      if (dark && runStart < 0) runStart = col;
      if (!dark && runStart >= 0) {
        const width = col - runStart;
        parts.push(`M${runStart + QUIET_ZONE} ${row + QUIET_ZONE}h${width}v1h-${width}z`);
        runStart = -1;
      }
    }
  }

  return { size: count + QUIET_ZONE * 2, path: parts.join("") };
}
