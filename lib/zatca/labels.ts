/**
 * Arabic terms for the things a Saudi tax invoice has to say.
 *
 * A tax invoice must be issued in Arabic, and the usual way to meet that without making the
 * document unreadable to an English-speaking buyer is a bilingual one: every label carries both.
 * Collected here rather than inlined in the renderers so the invoice PDF, the credit note and the
 * till receipt all use the same wording — a document that calls VAT one thing in one place and
 * something else in another invites questions nobody wants to answer.
 */

/** English label with its Arabic twin. */
export type BiLabel = { en: string; ar: string };

export const ZatcaLabel = {
  taxInvoice: { en: "TAX INVOICE", ar: "فاتورة ضريبية" },
  simplifiedTaxInvoice: { en: "SIMPLIFIED TAX INVOICE", ar: "فاتورة ضريبية مبسطة" },
  creditNote: { en: "CREDIT NOTE", ar: "إشعار دائن" },
  quotation: { en: "QUOTATION", ar: "عرض سعر" },

  seller: { en: "Seller", ar: "البائع" },
  buyer: { en: "Buyer", ar: "المشتري" },
  vatNumber: { en: "VAT number", ar: "الرقم الضريبي" },
  crNumber: { en: "CR number", ar: "رقم السجل التجاري" },

  date: { en: "Date", ar: "التاريخ" },
  dueDate: { en: "Due date", ar: "تاريخ الاستحقاق" },
  invoiceNumber: { en: "Invoice number", ar: "رقم الفاتورة" },

  description: { en: "Description", ar: "الوصف" },
  quantity: { en: "Qty", ar: "الكمية" },
  unitPrice: { en: "Unit price", ar: "سعر الوحدة" },
  discount: { en: "Disc.", ar: "الخصم" },
  vat: { en: "VAT", ar: "الضريبة" },
  lineTotal: { en: "Total", ar: "الإجمالي" },

  subtotal: { en: "Subtotal", ar: "الإجمالي قبل الضريبة" },
  // No rate in the label: the rate comes from Settings → VAT and may differ per line.
  vatTotal: { en: "VAT", ar: "ضريبة القيمة المضافة" },
  grandTotal: { en: "Grand total", ar: "الإجمالي شامل الضريبة" },
  paid: { en: "Paid", ar: "المدفوع" },
  balanceDue: { en: "Balance due", ar: "المبلغ المستحق" },
  change: { en: "Change", ar: "المتبقي" },
  cashier: { en: "Cashier", ar: "الكاشير" },
  receipt: { en: "Receipt", ar: "إيصال" },
  total: { en: "TOTAL", ar: "الإجمالي" },
} as const;

/** "Subtotal / الإجمالي قبل الضريبة" — for places with room for one line only. */
export function bothWays(label: BiLabel): string {
  return `${label.en} / ${label.ar}`;
}
