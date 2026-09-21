import type { InvoiceStatus, QuotationStatus } from "@/lib/generated/prisma/enums";
import type { StatusTone } from "@/components/shared/status-badge";

// Status derivation for sales documents. `today` is a "YYYY-MM-DD" calendar date in the
// company time zone; document dates are Date objects at UTC midnight (Postgres DATE).

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Draft/Sent quotations expire once their validity date has passed. */
export function deriveQuotationStatus(q: { status: QuotationStatus; validUntil: Date | null }, today: string): QuotationStatus {
  if ((q.status === "DRAFT" || q.status === "SENT") && q.validUntil && dateOnly(q.validUntil) < today) return "EXPIRED";
  return q.status;
}

export type InvoiceStatusInput = {
  status: InvoiceStatus;
  date: Date;
  dueDate: Date;
  grandTotal: number;
  paidTotal: number;
  depositAmount: number;
  sentAt: Date | null;
};

/**
 * Draft → Sent → Partially Paid → Paid, with Overdue when money is late:
 * the full balance after the due date, or an unpaid deposit after the invoice date.
 */
export function deriveInvoiceStatus(inv: InvoiceStatusInput, today: string): InvoiceStatus {
  const remaining = inv.grandTotal - inv.paidTotal;
  if (inv.grandTotal > 0 && remaining <= 0) return "PAID";
  const issued = inv.status !== "DRAFT" || inv.sentAt !== null || inv.paidTotal > 0;
  if (!issued) return "DRAFT";

  const pastDue = dateOnly(inv.dueDate) < today && remaining > 0;
  const depositLate = inv.depositAmount > 0 && dateOnly(inv.date) < today && inv.paidTotal < inv.depositAmount;
  if (pastDue || depositLate) return "OVERDUE";
  return inv.paidTotal > 0 ? "PARTIALLY_PAID" : "SENT";
}

export const QUOTATION_STATUS: Record<QuotationStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "warning" },
};

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  PARTIALLY_PAID: { label: "Partially Paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
};

// --- Manual status changes ---------------------------------------------------
// Which statuses a person may pick for a document, mirroring the rules the Server Actions enforce.
// Everything else (Paid, Partially Paid, Overdue, Expired) is derived and cannot be chosen.

export const AUTOMATIC_SALES_STATUS = "This status follows the payments and dates on the document.";

export function quotationTransitions(status: QuotationStatus, locked: boolean): QuotationStatus[] {
  // Converted to an invoice, or already decided: the document is settled.
  if (locked || status === "ACCEPTED" || status === "REJECTED") return [];
  // markQuotationSent() only accepts drafts and expired quotations.
  const canSend = status === "DRAFT" || status === "EXPIRED";
  return canSend ? ["SENT", "ACCEPTED", "REJECTED"] : ["ACCEPTED", "REJECTED"];
}

export function invoiceTransitions(status: InvoiceStatus): InvoiceStatus[] {
  return status === "DRAFT" ? ["SENT"] : [];
}
