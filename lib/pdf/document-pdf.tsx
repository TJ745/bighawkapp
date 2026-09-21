import "server-only";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { PdfFont, PdfHeaderStyle } from "@/lib/generated/prisma/enums";

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
};

export type PdfDocumentData = {
  title: string; // "QUOTATION", "INVOICE", …
  number: string;
  meta: { label: string; value: string }[]; // Date, Valid until, Due date, Reference…
  partyLabel: string; // "Bill to" / "Supplier"
  partyLines: string[];
  items: { description: string; quantity: string; unitPrice: string; discount: string; vat: string; total: string }[];
  totals: { label: string; value: string; emphasis?: boolean }[];
  sections: { title: string; lines: string[] }[]; // Payment terms, bank details, terms & conditions…
  statusNote?: string; // e.g. "PAID" stamp text
};

const FONT_FAMILY: Record<PdfFont, { regular: string; bold: string }> = {
  HELVETICA: { regular: "Helvetica", bold: "Helvetica-Bold" },
  TIMES: { regular: "Times-Roman", bold: "Times-Bold" },
  COURIER: { regular: "Courier", bold: "Courier-Bold" },
};

function makeStyles(b: PdfBranding) {
  const font = FONT_FAMILY[b.font];
  return StyleSheet.create({
    page: { fontFamily: font.regular, fontSize: 9.5, color: "#1f2937", paddingTop: 36, paddingBottom: 56, paddingHorizontal: 40 },
    bold: { fontFamily: font.bold },
    muted: { color: b.secondaryColor },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
    headerCentered: { alignItems: "center", marginBottom: 18 },
    logo: { maxWidth: 120, maxHeight: 54, objectFit: "contain" },
    companyName: { fontFamily: font.bold, fontSize: 14, color: b.primaryColor },
    companyLine: { fontSize: 8.5, color: b.secondaryColor, lineHeight: 1.4 },
    titleBlock: { alignItems: "flex-end" },
    title: { fontFamily: font.bold, fontSize: 20, color: b.primaryColor, letterSpacing: 1 },
    number: { fontSize: 11, marginTop: 2 },
    rule: { height: 2, backgroundColor: b.primaryColor, marginBottom: 14 },
    infoRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 16 },
    infoBox: { width: "48%" },
    infoLabel: { fontFamily: font.bold, fontSize: 8, color: b.secondaryColor, textTransform: "uppercase", marginBottom: 4 },
    metaRow: { flexDirection: "row", marginBottom: 2 },
    metaKey: { width: 80, color: b.secondaryColor },
    table: { marginTop: 4 },
    th: { flexDirection: "row", backgroundColor: b.primaryColor, color: "#ffffff", paddingVertical: 5, paddingHorizontal: 6, fontFamily: font.bold, fontSize: 8.5 },
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
    totalEmph: { backgroundColor: "#f3f4f6", fontFamily: font.bold, fontSize: 11, marginTop: 2, paddingVertical: 5 },
    section: { marginTop: 14 },
    sectionTitle: { fontFamily: font.bold, fontSize: 9, color: b.primaryColor, marginBottom: 3 },
    sectionLine: { lineHeight: 1.4 },
    footer: { position: "absolute", left: 40, right: 40, bottom: 24, borderTopWidth: 0.5, borderTopColor: "#e5e7eb", paddingTop: 6, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: b.secondaryColor },
    stamp: { position: "absolute", top: 120, right: 40, borderWidth: 2, borderColor: b.primaryColor, color: b.primaryColor, paddingVertical: 4, paddingHorizontal: 12, fontFamily: font.bold, fontSize: 16, transform: "rotate(-12deg)", opacity: 0.6 },
  });
}

function Header({ b, d, s }: { b: PdfBranding; d: PdfDocumentData; s: ReturnType<typeof makeStyles> }) {
  // react-pdf Image has no alt prop; the logo is decorative.
  // eslint-disable-next-line jsx-a11y/alt-text
  const logo = b.logo ? <Image src={{ data: b.logo.data, format: b.logo.mimeType === "image/png" ? "png" : "jpg" }} style={s.logo} /> : null;
  const companyInfo = (align: "left" | "center") => (
    <View style={{ alignItems: align === "center" ? "center" : "flex-start" }}>
      <Text style={s.companyName}>{b.companyName}</Text>
      {b.headerStyle !== "MINIMAL"
        ? b.companyLines.map((line, i) => (
            <Text key={i} style={s.companyLine}>
              {line}
            </Text>
          ))
        : null}
    </View>
  );

  if (b.headerStyle === "CENTERED") {
    return (
      <View style={s.headerCentered}>
        {logo}
        <View style={{ marginTop: 6, alignItems: "center" }}>{companyInfo("center")}</View>
        <View style={{ marginTop: 10, alignItems: "center" }}>
          <Text style={s.title}>{d.title}</Text>
          <Text style={s.number}>{d.number}</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={s.headerRow}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
        {logo}
        {companyInfo("left")}
      </View>
      <View style={s.titleBlock}>
        <Text style={s.title}>{d.title}</Text>
        <Text style={s.number}>{d.number}</Text>
      </View>
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
                <Text style={s.metaKey}>{m.label}</Text>
                <Text style={s.bold}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={s.cDesc}>Description</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cPrice}>Unit price</Text>
            <Text style={s.cDisc}>Disc.</Text>
            <Text style={s.cVat}>VAT</Text>
            <Text style={s.cTotal}>Total</Text>
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

        <View style={s.totalsWrap} wrap={false}>
          <View style={s.totals}>
            {d.totals.map((t) => (
              <View key={t.label} style={[s.totalRow, ...(t.emphasis ? [s.totalEmph] : [])]}>
                <Text>{t.label}</Text>
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
  return renderToBuffer(<DocumentPdf branding={branding} data={data} />);
}
