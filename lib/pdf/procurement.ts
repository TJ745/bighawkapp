import "server-only";
import type { PurchaseDetail, SupplierQuotationDetail } from "@/lib/data/procurement";
import type { PurchaseReturnDetail } from "@/lib/data/purchase-returns";
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

/**
 * Goods sent back to a supplier — the document that travels with them.
 *
 * **No ZATCA QR.** The QR is a seller's statement about tax they charged, and here the business
 * is the buyer: the supplier issues the credit note, this is the buyer's own record of what went
 * back and what it was worth. Stamping it would claim something untrue about who taxed whom.
 */
export async function renderPurchaseReturnPdf(r: PurchaseReturnDetail): Promise<Buffer> {
  const [branding, f] = await Promise.all([getPdfBranding(), getFormatters()]);

  const data: PdfDocumentData = {
    title: "RETURN TO SUPPLIER",
    number: r.number,
    meta: [
      { label: "Date", value: f.date(r.date) },
      { label: "Against purchase", value: r.purchase.number },
      { label: "Sent from", value: r.branchName },
      ...(r.status === "CANCELLED" ? [{ label: "Status", value: "Cancelled" }] : []),
    ],
    partyLabel: "Supplier",
    partyLines: partyLines(r.supplier),
    items: itemRows(r.items, f),
    totals: totalRows(r, f),
    sections: [
      {
        title: "Why these goods were returned",
        lines: [
          r.reason,
          `Against purchase ${r.purchase.number} dated ${f.date(r.purchase.date)}.`,
          r.refundedTotal > 0
            ? `${f.money(r.refundedTotal)} was returned by the supplier${
                r.grandTotal > r.refundedTotal ? `; ${f.money(r.grandTotal - r.refundedTotal)} was credited against the account` : ""
              }.`
            : "The full amount was credited against the account.",
          ...(r.status === "CANCELLED" ? [`This return was cancelled${r.cancelReason ? `: ${r.cancelReason}` : "."}`] : []),
        ],
      },
    ],
  };
  return renderDocumentPdf(branding, data);
}
