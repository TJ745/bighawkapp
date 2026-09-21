import "server-only";
import type { DocumentCustomer, DocumentItem, InvoiceDetail, QuotationDetail } from "@/lib/data/sales";
import { getFormatters } from "@/lib/settings/formatters";
import { getCompanyBankLines, getPdfBranding } from "./branding";
import { renderDocumentPdf, type PdfDocumentData } from "./document-pdf";

type Formatters = Awaited<ReturnType<typeof getFormatters>>;

export function partyLines(p: DocumentCustomer | { name: string; contactPerson: string | null; address: string | null; vatNumber: string | null; crNumber: string | null; phone: string; email: string | null }) {
  return [
    p.name,
    p.contactPerson ? `Attn: ${p.contactPerson}` : null,
    p.address,
    p.vatNumber ? `VAT No. ${p.vatNumber}` : null,
    p.crNumber ? `CR No. ${p.crNumber}` : null,
    [p.phone, p.email].filter(Boolean).join(" · ") || null,
  ].filter((l): l is string => Boolean(l));
}

export function itemRows(items: DocumentItem[], f: Formatters) {
  return items.map((i) => ({
    description: i.description,
    quantity: f.number(i.quantity).replace(/[.,]00$/, ""),
    unitPrice: f.number(i.unitPrice),
    discount: i.discountPercent > 0 ? `${f.number(i.discountPercent).replace(/[.,]00$/, "")}%` : "—",
    vat: i.vatRate > 0 ? `${f.number(i.vatRate).replace(/[.,]00$/, "")}%` : "—",
    total: f.number(i.lineTotal),
  }));
}

export function totalRows(t: { subtotal: number; discountTotal: number; vatTotal: number; grandTotal: number }, f: Formatters) {
  const rows: PdfDocumentData["totals"] = [{ label: "Subtotal", value: f.money(t.subtotal) }];
  if (t.discountTotal > 0) rows.push({ label: "Discount", value: `- ${f.money(t.discountTotal)}` });
  rows.push({ label: "VAT", value: f.money(t.vatTotal) });
  rows.push({ label: "Grand total", value: f.money(t.grandTotal), emphasis: true });
  return rows;
}

export function termsSection(terms: string | null) {
  return terms?.trim() ? [{ title: "Terms & conditions", lines: terms.split(/\r?\n/) }] : [];
}

export async function renderQuotationPdf(q: QuotationDetail): Promise<Buffer> {
  const [branding, f] = await Promise.all([getPdfBranding(), getFormatters()]);
  const data: PdfDocumentData = {
    title: "QUOTATION",
    number: q.number,
    meta: [
      { label: "Date", value: f.date(q.date) },
      ...(q.validUntil ? [{ label: "Valid until", value: f.date(q.validUntil) }] : []),
    ],
    partyLabel: "Prepared for",
    partyLines: partyLines(q.customer),
    items: itemRows(q.items, f),
    totals: totalRows(q, f),
    sections: termsSection(q.terms),
  };
  return renderDocumentPdf(branding, data);
}

export async function renderInvoicePdf(inv: InvoiceDetail): Promise<Buffer> {
  const [branding, f, bankLines] = await Promise.all([getPdfBranding(), getFormatters(), getCompanyBankLines()]);

  const paymentLines: string[] = [];
  if (inv.depositAmount > 0) {
    paymentLines.push(`Deposit ${f.number(inv.depositPercent).replace(/[.,]00$/, "")}%: ${f.money(inv.depositAmount)} due on ${f.date(inv.date)}`);
    paymentLines.push(`Remaining: ${f.money(inv.grandTotal - inv.depositAmount)} due by ${f.date(inv.dueDate)}`);
  } else {
    paymentLines.push(inv.paymentTermDays === 0 ? "Due immediately" : `${inv.paymentTermDays} days — due by ${f.date(inv.dueDate)}`);
  }
  if (inv.paidTotal > 0) {
    paymentLines.push(`Paid to date: ${f.money(inv.paidTotal)}`);
    paymentLines.push(`Balance due: ${f.money(inv.remaining)}`);
  }

  const totals = totalRows(inv, f);
  if (inv.paidTotal > 0) {
    totals.push({ label: "Paid", value: `- ${f.money(inv.paidTotal)}` });
    totals.push({ label: "Balance due", value: f.money(inv.remaining), emphasis: true });
  }

  const data: PdfDocumentData = {
    title: "INVOICE",
    number: inv.number,
    meta: [
      { label: "Date", value: f.date(inv.date) },
      { label: "Due date", value: f.date(inv.dueDate) },
      ...(inv.quotation ? [{ label: "Quotation", value: inv.quotation.number }] : []),
    ],
    partyLabel: "Bill to",
    partyLines: partyLines(inv.customer),
    items: itemRows(inv.items, f),
    totals,
    sections: [
      { title: "Payment terms", lines: paymentLines },
      ...(bankLines.length ? [{ title: "Bank details", lines: bankLines }] : []),
      ...termsSection(inv.terms),
    ],
    statusNote: inv.status === "PAID" ? "PAID" : undefined,
  };
  return renderDocumentPdf(branding, data);
}
