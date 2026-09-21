import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ProjectDetail } from "@/lib/data/projects";
import { listInvoices } from "@/lib/data/sales";
import { listPurchases } from "@/lib/data/procurement";
import { getFormatters } from "@/lib/settings/formatters";
import { PROJECT_STATUS, projectTypeLabel } from "@/lib/validation/projects";
import { getPdfBranding } from "./branding";
import type { PdfBranding } from "./document-pdf";

const FONT: Record<PdfBranding["font"], { regular: string; bold: string }> = {
  HELVETICA: { regular: "Helvetica", bold: "Helvetica-Bold" },
  TIMES: { regular: "Times-Roman", bold: "Times-Bold" },
  COURIER: { regular: "Courier", bold: "Courier-Bold" },
};

/** One-page project summary: details, financial overview and linked invoices/purchases. */
export async function renderProjectPdf(project: ProjectDetail): Promise<Buffer> {
  const [b, f, invoices, purchases] = await Promise.all([
    getPdfBranding(),
    getFormatters(),
    listInvoices({ q: "", filter: "all", page: 1 }, undefined, project.id),
    listPurchases({ q: "", filter: "all", page: 1 }, { projectId: project.id }),
  ]);
  const font = FONT[b.font];
  const s = StyleSheet.create({
    page: { fontFamily: font.regular, fontSize: 9.5, color: "#1f2937", paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40 },
    bold: { fontFamily: font.bold },
    header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
    company: { fontFamily: font.bold, fontSize: 14, color: b.primaryColor },
    title: { fontFamily: font.bold, fontSize: 18, color: b.primaryColor },
    rule: { height: 2, backgroundColor: b.primaryColor, marginBottom: 14 },
    grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
    cell: { width: "50%", marginBottom: 4, flexDirection: "row" },
    key: { width: 110, color: b.secondaryColor },
    section: { fontFamily: font.bold, fontSize: 10, color: b.primaryColor, marginTop: 12, marginBottom: 4 },
    row: { flexDirection: "row", paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: "#e5e7eb" },
    th: { flexDirection: "row", backgroundColor: b.primaryColor, color: "#ffffff", paddingVertical: 4, paddingHorizontal: 6, fontFamily: font.bold, fontSize: 8.5 },
    c1: { flex: 1 },
    c2: { width: 90 },
    c3: { width: 90, textAlign: "right" },
    c4: { width: 80 },
    fin: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    finBox: { width: "31%", borderWidth: 0.5, borderColor: "#e5e7eb", padding: 8, marginBottom: 8 },
    finLabel: { fontSize: 8, color: b.secondaryColor },
    finValue: { fontFamily: font.bold, fontSize: 11, marginTop: 2 },
    footer: { position: "absolute", left: 40, right: 40, bottom: 24, borderTopWidth: 0.5, borderTopColor: "#e5e7eb", paddingTop: 6, fontSize: 8, color: b.secondaryColor },
  });
  const fin = project.financials;
  const finItems = [
    ["Project value", fin.value],
    ["Total sales", fin.totalSales],
    ["Total purchases", fin.totalPurchases],
    ["Total paid", fin.totalPaid],
    ["Outstanding", fin.outstanding],
    ["Estimated profit", fin.estimatedProfit],
  ] as const;

  return renderToBuffer(
    <Document title={`Project ${project.code}`} author={b.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.company}>{b.companyName}</Text>
          <Text style={s.title}>PROJECT SUMMARY</Text>
        </View>
        <View style={s.rule} />
        <View style={s.grid}>
          {[
            ["Project", `${project.code} — ${project.name}`],
            ["Customer", project.customer.name],
            ["Type", projectTypeLabel(project.type)],
            ["Status", PROJECT_STATUS[project.status].label],
            ["Start date", f.date(project.startDate)],
            ["Expected completion", project.expectedCompletionDate ? f.date(project.expectedCompletionDate) : "—"],
          ].map(([k, v]) => (
            <View key={k} style={s.cell}>
              <Text style={s.key}>{k}</Text>
              <Text style={s.bold}>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>Financial overview</Text>
        <View style={s.fin}>
          {finItems.map(([label, value]) => (
            <View key={label} style={s.finBox}>
              <Text style={s.finLabel}>{label}</Text>
              <Text style={s.finValue}>{f.money(value)}</Text>
            </View>
          ))}
        </View>

        <Text style={s.section}>Invoices</Text>
        <View style={s.th}>
          <Text style={s.c2}>Invoice</Text>
          <Text style={s.c1}>Date</Text>
          <Text style={s.c4}>Status</Text>
          <Text style={s.c3}>Total</Text>
          <Text style={s.c3}>Paid</Text>
        </View>
        {invoices.items.length === 0 ? <Text style={{ padding: 6, color: b.secondaryColor }}>No invoices linked.</Text> : null}
        {invoices.items.map((i) => (
          <View key={i.id} style={s.row}>
            <Text style={s.c2}>{i.number}</Text>
            <Text style={s.c1}>{f.date(i.date)}</Text>
            <Text style={s.c4}>{i.status.replace("_", " ")}</Text>
            <Text style={s.c3}>{f.number(i.grandTotal)}</Text>
            <Text style={s.c3}>{f.number(i.paidTotal)}</Text>
          </View>
        ))}

        <Text style={s.section}>Purchases</Text>
        <View style={s.th}>
          <Text style={s.c2}>Purchase</Text>
          <Text style={s.c1}>Supplier</Text>
          <Text style={s.c4}>Status</Text>
          <Text style={s.c3}>Total</Text>
          <Text style={s.c3}>Paid</Text>
        </View>
        {purchases.items.length === 0 ? <Text style={{ padding: 6, color: b.secondaryColor }}>No purchases linked.</Text> : null}
        {purchases.items.map((p) => (
          <View key={p.id} style={s.row}>
            <Text style={s.c2}>{p.number}</Text>
            <Text style={s.c1}>{p.supplier.name}</Text>
            <Text style={s.c4}>{p.status.replace("_", " ")}</Text>
            <Text style={s.c3}>{f.number(p.grandTotal)}</Text>
            <Text style={s.c3}>{f.number(p.paidTotal)}</Text>
          </View>
        ))}

        {project.notes ? (
          <>
            <Text style={s.section}>Notes</Text>
            <Text>{project.notes}</Text>
          </>
        ) : null}
        <View style={s.footer} fixed>
          <Text>{b.footerText || b.companyName}</Text>
        </View>
      </Page>
    </Document>,
  );
}
