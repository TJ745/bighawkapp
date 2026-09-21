import "server-only";
import type { PurchaseDetail, SupplierQuotationDetail } from "@/lib/data/procurement";
import { getFormatters } from "@/lib/settings/formatters";
import { getPdfBranding } from "./branding";
import { renderDocumentPdf, type PdfDocumentData } from "./document-pdf";
import { itemRows, partyLines, totalRows } from "./sales";

export async function renderSupplierQuotationPdf(q: SupplierQuotationDetail): Promise<Buffer> {
  const [branding, f] = await Promise.all([getPdfBranding(), getFormatters()]);
  const data: PdfDocumentData = {
    title: "SUPPLIER QUOTATION",
    number: q.number,
    meta: [
      { label: "Date", value: f.date(q.date) },
      ...(q.validUntil ? [{ label: "Valid until", value: f.date(q.validUntil) }] : []),
      ...(q.supplierReference ? [{ label: "Supplier ref.", value: q.supplierReference }] : []),
    ],
    partyLabel: "Supplier",
    partyLines: partyLines(q.supplier),
    items: itemRows(q.items, f),
    totals: totalRows(q, f),
    sections: [],
  };
  return renderDocumentPdf(branding, data);
}

export async function renderPurchasePdf(p: PurchaseDetail): Promise<Buffer> {
  const [branding, f] = await Promise.all([getPdfBranding(), getFormatters()]);
  const totals = totalRows(p, f);
  if (p.paidTotal > 0) {
    totals.push({ label: "Paid", value: `- ${f.money(p.paidTotal)}` });
    totals.push({ label: "Balance", value: f.money(p.remaining), emphasis: true });
  }
  const data: PdfDocumentData = {
    title: "PURCHASE ORDER",
    number: p.number,
    meta: [
      { label: "Date", value: f.date(p.date) },
      { label: "Due date", value: f.date(p.dueDate) },
      ...(p.supplierReference ? [{ label: "Supplier ref.", value: p.supplierReference }] : []),
      ...(p.supplierQuotation ? [{ label: "Quotation", value: p.supplierQuotation.number }] : []),
    ],
    partyLabel: "Supplier",
    partyLines: partyLines(p.supplier),
    items: itemRows(p.items, f),
    totals,
    sections: [
      {
        title: "Payment terms",
        lines: [p.paymentTermDays === 0 ? "Due immediately" : `${p.paymentTermDays} days — due by ${f.date(p.dueDate)}`],
      },
    ],
    statusNote: p.status === "PAID" ? "PAID" : undefined,
  };
  return renderDocumentPdf(branding, data);
}
