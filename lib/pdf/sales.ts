import "server-only";
import type { CreditNoteDetail } from "@/lib/data/credit-notes";
import type { DocumentCustomer, DocumentItem, InvoiceDetail, QuotationDetail } from "@/lib/data/sales";
import { getFormatters } from "@/lib/settings/formatters";
import { zatcaStamp } from "@/lib/data/zatca";
import { ZatcaLabel } from "@/lib/zatca/labels";
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

/**
 * The totals block. The Arabic twins are always attached; the renderer prints them only when the
 * document is a tax invoice, so one list of totals serves both cases.
 */
export function totalRows(t: { subtotal: number; discountTotal: number; vatTotal: number; grandTotal: number }, f: Formatters) {
  const rows: PdfDocumentData["totals"] = [{ label: "Subtotal", labelAr: ZatcaLabel.subtotal.ar, value: f.money(t.subtotal) }];
  if (t.discountTotal > 0) rows.push({ label: "Discount", labelAr: ZatcaLabel.discount.ar, value: `- ${f.money(t.discountTotal)}` });
  rows.push({ label: "VAT", labelAr: ZatcaLabel.vatTotal.ar, value: f.money(t.vatTotal) });
  rows.push({ label: "Grand total", labelAr: ZatcaLabel.grandTotal.ar, value: f.money(t.grandTotal), emphasis: true });
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
  const [branding, f, bankLines, stamp] = await Promise.all([
    getPdfBranding(),
    getFormatters(),
    getCompanyBankLines(),
    // Standard or simplified is decided by the customer's VAT number, and the QR encodes the
    // invoice's own stored figures.
    zatcaStamp({ document: "INVOICE", buyer: inv.customer, issuedAt: inv.date, totalWithVat: inv.grandTotal, vatTotal: inv.vatTotal }),
  ]);

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
    title: stamp?.title.en ?? "INVOICE",
    titleAr: stamp?.title.ar,
    qr: stamp?.qr,
    number: inv.number,
    meta: [
      { label: "Date", labelAr: ZatcaLabel.date.ar, value: f.date(inv.date) },
      { label: "Due date", labelAr: ZatcaLabel.dueDate.ar, value: f.date(inv.dueDate) },
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

/**
 * A credit note is a tax document in its own right, so it carries its own number, the invoice it
 * reverses, and the VAT it gives back. The amounts are shown as positive figures under a title
 * that says what they are, which is how a credit note is read.
 */
export async function renderCreditNotePdf(note: CreditNoteDetail): Promise<Buffer> {
  const [branding, f, stamp] = await Promise.all([
    getPdfBranding(),
    getFormatters(),
    zatcaStamp({ document: "CREDIT_NOTE", buyer: note.customer, issuedAt: note.date, totalWithVat: note.grandTotal, vatTotal: note.vatTotal }),
  ]);

  const totals = totalRows(note, f);
  const sections: PdfDocumentData["sections"] = [
    {
      title: "Why this credit note was issued",
      lines: [
        note.reason,
        `Against invoice ${note.invoice.number} dated ${f.date(note.invoice.date)}.`,
        note.refundedTotal > 0
          ? `${f.money(note.refundedTotal)} was refunded${note.grandTotal > note.refundedTotal ? `; ${f.money(note.grandTotal - note.refundedTotal)} was credited against the account` : ""}.`
          : "The full amount was credited against the account.",
        ...(note.status === "CANCELLED" ? [`This credit note was cancelled${note.cancelReason ? `: ${note.cancelReason}` : "."}`] : []),
      ],
    },
  ];

  const data: PdfDocumentData = {
    title: "CREDIT NOTE",
    titleAr: stamp?.title.ar,
    qr: stamp?.qr,
    number: note.number,
    meta: [
      { label: "Date", labelAr: ZatcaLabel.date.ar, value: f.date(note.date) },
      { label: "Against invoice", value: note.invoice.number },
      ...(note.status === "CANCELLED" ? [{ label: "Status", value: "Cancelled" }] : []),
    ],
    partyLabel: "Credit to",
    partyLines: partyLines(note.customer),
    items: itemRows(note.items, f),
    totals,
    sections,
  };
  return renderDocumentPdf(branding, data);
}
