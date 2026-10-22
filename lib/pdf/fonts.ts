import "server-only";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Fonts for PDFs.
 *
 * react-pdf's built-in faces (Helvetica, Times, Courier) carry no Arabic glyphs at all, so a Saudi
 * tax invoice cannot be printed with them — the Arabic would come out as empty boxes. Amiri is a
 * Naskh face with both Arabic and Latin coverage, which means a bilingual invoice needs one font
 * rather than two and never has to fall back mid-sentence.
 *
 * Arabic also has to be *shaped*: letters change form depending on their neighbours. That is done
 * by the font's GSUB table, which is why a real font file is bundled (`assets/fonts`) instead of
 * relying on anything the host might have installed.
 *
 * Licensed under the SIL Open Font License 1.1 — see `assets/fonts/Amiri-OFL.txt`.
 */
export const ARABIC_FONT_FAMILY = "Amiri";

let registered = false;

/** Registers the Arabic font once per process. Safe to call on every render. */
export function registerArabicFont() {
  if (registered) return;
  // Resolved from the working directory, which is the project root under both `next dev` and
  // `next build`. The files are plain assets, so nothing bundles or transforms them.
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: ARABIC_FONT_FAMILY,
    fonts: [
      { src: path.join(dir, "Amiri-Regular.ttf"), fontWeight: 400 },
      { src: path.join(dir, "Amiri-Bold.ttf"), fontWeight: 700 },
    ],
  });
  registered = true;
}
