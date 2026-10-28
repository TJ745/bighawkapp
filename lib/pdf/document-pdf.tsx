import "server-only";
import { Document, Image, Page, Path, StyleSheet, Svg, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import type { PdfFont, PdfHeaderStyle } from "@/lib/generated/prisma/enums";
import type { QrPath } from "@/lib/zatca/qr-image";
import { ZatcaLabel } from "@/lib/zatca/labels";
import { ARABIC_FONT_FAMILY, registerArabicFont } from "./fonts";

// Generic commercial document (quotation, invoice, supplier quotation, purchase).
// Layout and branding come entirely from Settings; callers supply the data only.

export type PdfBranding = {
  companyName: string;
  logo: { data: Buffer; mimeType: string } | null;
  companyLines: string[]; // address, VAT, CR, phone, email, website…
  primaryColor: string;
  secondaryColor: string;
  font: PdfFont;
  headerStyle: PdfHeaderStyle;
  footerText: string;
  /**
   * The seller as a Saudi tax invoice must state them — null when e-invoicing is off, which is
   * what keeps every existing document looking exactly as it did.
   */
  arabic: { companyName: string; addressLines: string[] } | null;
};

export type PdfDocumentData = {
  title: string; // "QUOTATION", "INVOICE", …
  /** The Arabic title, shown under the English one on a tax invoice. */
  titleAr?: string;
  number: string;
  meta: { label: string; labelAr?: string; value: string }[]; // Date, Valid until, Due date, Reference…
  partyLabel: string; // "Bill to" / "Supplier"
  partyLines: string[];
  items: { description: string; quantity: string; unitPrice: string; discount: string; vat: string; total: string }[];
  /**
   * Renames the item columns, for a document whose table is not a list of goods — a statement's
   * rows are dates and running balances. The widths and the layout stay exactly as they are; only
   * the headings change, and an overridden heading carries no Arabic twin because it is not one
   * of ZATCA's terms.
   */
  columns?: Partial<Record<"description" | "quantity" | "unitPrice" | "discount" | "vat" | "total", string>>;
  totals: { label: string; labelAr?: string; value: string; emphasis?: boolean }[];
  sections: { title: string; lines: string[] }[]; // Payment terms, bank details, terms & conditions…
  statusNote?: string; // e.g. "PAID" stamp text
  /** The ZATCA QR code. Present only when e-invoicing is on. */
  qr?: QrPath;
};

const FONT_FAMILY: Record<PdfFont, { regular: string; bold: string }> = {
  HELVETICA: { regular: "Helvetica", bold: "Helvetica-Bold" },
  TIMES: { regular: "Times-Roman", bold: "Times-Bold" },
  COURIER: { regular: "Courier", bold: "Courier-Bold" },
};

function makeStyles(b: PdfBranding) {
  // A tax invoice has to carry Arabic, and none of the built-in faces can draw it, so the Arabic
  // font takes over the whole document rather than being mixed in for some lines only.
  const font = b.arabic ? { regular: ARABIC_FONT_FAMILY, bold: ARABIC_FONT_FAMILY } : FONT_FAMILY[b.font];
  const boldStyle = b.arabic ? { fontWeight: 700 as const } : { fontFamily: font.bold };
  return StyleSheet.create({
    page: { fontFamily: font.regular, fontSize: 9.5, color: "#1f2937", paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40 },
    bold: { ...boldStyle },
    muted: { color: b.secondaryColor },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
    headerCentered: { alignItems: "center", marginBottom: 18 },
    logo: { maxWidth: 120, maxHeight: 54, objectFit: "contain" },
    companyName: { ...boldStyle, fontSize: 14, color: b.primaryColor },
    companyLine: { fontSize: 8.5, color: b.secondaryColor, lineHeight: 1.4 },
    titleBlock: { alignItems: "flex-end" },
    title: { ...boldStyle, fontSize: 20, color: b.primaryColor, letterSpacing: 1 },
    number: { fontSize: 11, marginTop: 2 },
    rule: { height: 2, backgroundColor: b.primaryColor, marginBottom: 14 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
    infoBox: { width: "48%" },
    infoLabel: { ...boldStyle, fontSize: 8, color: b.secondaryColor, textTransform: "uppercase", marginBottom: 4 },
    metaRow: { flexDirection: "row", marginBottom: 2 },
    metaKey: { width: 80, color: b.secondaryColor },
    table: { marginTop: 4 },
    th: { flexDirection: "row", backgroundColor: b.primaryColor, color: "#ffffff", paddingVertical: 5, paddingHorizontal: 6, ...boldStyle, fontSize: 8.5 },
    tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
    cDesc: { flex: 1, paddingRight: 6 },
    cQty: { width: 44, textAlign: "right" },
    cPrice: { width: 72, textAlign: "right" },
    cDisc: { width: 44, textAlign: "right" },
    cVat: { width: 44, textAlign: "right" },
    cTotal: { width: 80, textAlign: "right" },
    totalsWrap: { flexDirection: "row", justifyContent: "flex-end", marginTop: 8 },
    totals: { width: 220 },
    totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, paddingHorizontal: 6 },
    totalEmph: { backgroundColor: "#f3f4f6", ...boldStyle, fontSize: 11, marginTop: 2, paddingVertical: 5 },
    section: { marginTop: 14 },
    sectionTitle: { ...boldStyle, fontSize: 9, color: b.primaryColor, marginBottom: 3 },
    sectionLine: { lineHeight: 1.4 },
    footer: { position: "absolute", left: 40, right: 40, bottom: 24, borderTopWidth: 0.5, borderTopColor: "#e5e7eb", paddingTop: 6, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: b.secondaryColor },
    stamp: { position: "absolute", top: 120, right: 40, borderWidth: 2, borderColor: b.primaryColor, color: b.primaryColor, paddingVertical: 4, paddingHorizontal: 12, ...boldStyle, fontSize: 16, transform: "rotate(-12deg)", opacity: 0.6 },

    // Arabic reads right to left, so its lines are aligned to the right of whatever box holds them.
    ar: { direction: "rtl", textAlign: "right" },
    arCompanyName: { ...boldStyle, fontSize: 12, color: b.primaryColor, direction: "rtl", textAlign: "right" },
    arTitle: { ...boldStyle, fontSize: 13, color: b.primaryColor, direction: "rtl" },
    arSmall: { fontSize: 8.5, color: b.secondaryColor, direction: "rtl", textAlign: "right" },
    // The Arabic twin of a column heading or a total, printed under the English one.
    arCell: { fontSize: 7, direction: "rtl" },
    qrWrap: { alignItems: "center", width: 96 },
    qrCaption: { fontSize: 6.5, color: b.secondaryColor, marginTop: 3, textAlign: "center" },
  });
}

function Header({ b, d, s }: { b: PdfBranding; d: PdfDocumentData; s: ReturnType<typeof makeStyles> }) {
  // react-pdf Image has no alt prop; the logo is decorative.
  // eslint-disable-next-line jsx-a11y/alt-text
  const logo = b.logo ? <Image src={{ data: b.logo.data, format: b.logo.mimeType === "image/png" ? "png" : "jpg" }} style={s.logo} /> : null;
  const companyInfo = (align: "left" | "center") => (
    <View style={{ alignItems: align === "center" ? "center" : "flex-start" }}>
      <Text style={s.companyName}>{b.companyName}</Text>
      {/* The Arabic legal name sits with the English one: it is the same seller, named twice. */}
      {b.arabic ? <Text style={s.arCompanyName}>{b.arabic.companyName}</Text> : null}
      {b.headerStyle !== "MINIMAL"
        ? b.companyLines.map((line, i) => (
            <Text key={i} style={s.companyLine}>
              {line}
            </Text>
          ))
        : null}
      {b.arabic && b.headerStyle !== "MINIMAL"
        ? b.arabic.addressLines.map((line, i) => (
            <Text key={i} style={s.arSmall}>
              {line}
            </Text>
          ))
        : null}
    </View>
  );
  const titleBlock = (
    <>
      <Text style={s.title}>{d.title}</Text>
      {/* Gated on the Arabic branding for the same reason as the labels: only that font can draw it. */}
      {b.arabic && d.titleAr ? <Text style={s.arTitle}>{d.titleAr}</Text> : null}
      <Text style={s.number}>{d.number}</Text>
    </>
  );

  if (b.headerStyle === "CENTERED") {
    return (
      <View style={s.headerCentered}>
        {logo}
        <View style={{ marginTop: 6, alignItems: "center" }}>{companyInfo("center")}</View>
        <View style={{ marginTop: 10, alignItems: "center" }}>{titleBlock}</View>
      </View>
    );
  }
  return (
    <View style={s.headerRow}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {logo}
        {companyInfo("left")}
      </View>
      <View style={s.titleBlock}>{titleBlock}</View>
    </View>
  );
}

/** A column heading, with its Arabic twin underneath on a tax invoice. */
type ColumnKey = NonNullable<PdfDocumentData["columns"]> extends Partial<Record<infer K, string>> ? K : never;

/** An overridden column heading, or ZATCA's own term when the document has not renamed it. */
function heading(d: PdfDocumentData, key: ColumnKey, fallback: { en: string; ar: string }) {
  const override = d.columns?.[key];
  return override ? { en: override, ar: "" } : fallback;
}

/** A renamed column is not one of ZATCA's terms, so it never gets an Arabic twin. */
function bilingual(d: PdfDocumentData, key: ColumnKey, b: PdfBranding) {
  return Boolean(b.arabic) && !d.columns?.[key];
}

function Th({
  style,
  label,
  bilingual,
  s,
}: {
  style: Style;
  label: { en: string; ar: string };
  bilingual: boolean;
  s: ReturnType<typeof makeStyles>;
}) {
  if (!bilingual) return <Text style={style}>{label.en}</Text>;
  return (
    <View style={style}>
      <Text>{label.en}</Text>
      <Text style={s.arCell}>{label.ar}</Text>
    </View>
  );
}

function DocumentPdf({ branding: b, data: d }: { branding: PdfBranding; data: PdfDocumentData }) {
  const s = makeStyles(b);
  return (
    <Document title={`${d.title} ${d.number}`} author={b.companyName}>
      <Page size="A4" style={s.page}>
        <Header b={b} d={d} s={s} />
        <View style={s.rule} />
        {d.statusNote ? <Text style={s.stamp}>{d.statusNote}</Text> : null}

        <View style={s.infoRow}>
          <View style={s.infoBox}>
            <Text style={s.infoLabel}>{d.partyLabel}</Text>
            {d.partyLines.map((line, i) => (
              <Text key={i} style={i === 0 ? s.bold : undefined}>
                {line}
              </Text>
            ))}
          </View>
          <View style={s.infoBox}>
            {d.meta.map((m) => (
              <View key={m.label} style={s.metaRow}>
                <Text style={s.metaKey}>{b.arabic && m.labelAr ? `${m.label} / ${m.labelAr}` : m.label}</Text>
                <Text style={s.bold}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.table}>
          {/* On a tax invoice each heading carries its Arabic twin on a second line, which keeps
              the column widths — and so the whole layout — exactly as they were. */}
          <View style={s.th} fixed>
            <Th style={s.cDesc} label={heading(d, "description", ZatcaLabel.description)} bilingual={bilingual(d, "description", b)} s={s} />
            <Th style={s.cQty} label={heading(d, "quantity", ZatcaLabel.quantity)} bilingual={bilingual(d, "quantity", b)} s={s} />
            <Th style={s.cPrice} label={heading(d, "unitPrice", ZatcaLabel.unitPrice)} bilingual={bilingual(d, "unitPrice", b)} s={s} />
            <Th style={s.cDisc} label={heading(d, "discount", ZatcaLabel.discount)} bilingual={bilingual(d, "discount", b)} s={s} />
            <Th style={s.cVat} label={heading(d, "vat", ZatcaLabel.vat)} bilingual={bilingual(d, "vat", b)} s={s} />
            <Th style={s.cTotal} label={heading(d, "total", ZatcaLabel.lineTotal)} bilingual={bilingual(d, "total", b)} s={s} />
          </View>
          {d.items.map((item, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cDesc}>{item.description}</Text>
              <Text style={s.cQty}>{item.quantity}</Text>
              <Text style={s.cPrice}>{item.unitPrice}</Text>
              <Text style={s.cDisc}>{item.discount}</Text>
              <Text style={s.cVat}>{item.vat}</Text>
              <Text style={s.cTotal}>{item.total}</Text>
            </View>
          ))}
        </View>

        {/* The QR sits beside the totals: it encodes those very figures, and a verifier scanning
            it wants to compare the two without turning the page. */}
        <View style={[s.totalsWrap, ...(d.qr ? [{ justifyContent: "space-between" as const }] : [])]} wrap={false}>
          {d.qr ? (
            <View style={s.qrWrap}>
              <Svg width={90} height={90} viewBox={`0 0 ${d.qr.size} ${d.qr.size}`}>
                <Path d={d.qr.path} fill="#000000" />
              </Svg>
              <Text style={s.qrCaption}>Scan to verify · امسح للتحقق</Text>
            </View>
          ) : null}
          <View style={s.totals}>
            {d.totals.map((t) => (
              <View key={t.label} style={[s.totalRow, ...(t.emphasis ? [s.totalEmph] : [])]}>
                {/* The Arabic twin is printed only on a tax invoice: with e-invoicing off the
                    document uses a built-in font, which has no Arabic glyphs to draw it with. */}
                <Text>{b.arabic && t.labelAr ? `${t.label} / ${t.labelAr}` : t.label}</Text>
                <Text style={t.emphasis ? undefined : s.bold}>{t.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {d.sections.map((section) => (
          <View key={section.title} style={s.section} wrap={false}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            {section.lines.map((line, i) => (
              <Text key={i} style={s.sectionLine}>
                {line}
              </Text>
            ))}
          </View>
        ))}

        <View style={s.footer} fixed>
          <Text>{b.footerText || (b.headerStyle === "MINIMAL" ? b.companyLines.join(" · ") : b.companyName)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderDocumentPdf(branding: PdfBranding, data: PdfDocumentData): Promise<Buffer> {
  // Registered only when the document actually needs Arabic, so a company not using e-invoicing
  // never pays for loading the font.
  if (branding.arabic) registerArabicFont();
  return renderToBuffer(<DocumentPdf branding={branding} data={data} />);
}
