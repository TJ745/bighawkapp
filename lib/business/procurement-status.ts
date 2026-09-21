import type { PurchaseStatus, SupplierQuotationStatus } from "@/lib/generated/prisma/enums";
import type { StatusTone } from "@/components/shared/status-badge";

function dateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Draft/Received supplier quotations expire once their validity date has passed. */
export function deriveSupplierQuotationStatus(q: { status: SupplierQuotationStatus; validUntil: Date | null }, today: string): SupplierQuotationStatus {
  if ((q.status === "DRAFT" || q.status === "RECEIVED") && q.validUntil && dateOnly(q.validUntil) < today) return "EXPIRED";
  return q.status;
}

export type PurchaseStatusInput = {
  receivedAt: Date | null;
  supplierReference: string | null;
  dueDate: Date;
  grandTotal: number;
  paidTotal: number;
};

/**
 * Draft → Received → Unpaid / Partially Paid / Paid / Overdue.
 * Received = goods/services received, supplier invoice not yet on file.
 * Unpaid   = received and the supplier invoice/reference is recorded, so payment is expected.
 * Overdue  = anything received with a balance after the due date.
 */
export function derivePurchaseStatus(p: PurchaseStatusInput, today: string): PurchaseStatus {
  const remaining = p.grandTotal - p.paidTotal;
  if (p.grandTotal > 0 && remaining <= 0) return "PAID";
  if (!p.receivedAt && p.paidTotal === 0) return "DRAFT";
  if (dateOnly(p.dueDate) < today && remaining > 0) return "OVERDUE";
  if (p.paidTotal > 0) return "PARTIALLY_PAID";
  return p.supplierReference ? "UNPAID" : "RECEIVED";
}

export const SUPPLIER_QUOTATION_STATUS: Record<SupplierQuotationStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  RECEIVED: { label: "Received", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXPIRED: { label: "Expired", tone: "warning" },
};

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  RECEIVED: { label: "Received", tone: "info" },
  UNPAID: { label: "Unpaid", tone: "warning" },
  PARTIALLY_PAID: { label: "Partially Paid", tone: "warning" },
  PAID: { label: "Paid", tone: "success" },
  OVERDUE: { label: "Overdue", tone: "danger" },
};

// --- Manual status changes ---------------------------------------------------
// See the note in ./sales-status: only these transitions are a person's to make.

export const AUTOMATIC_PROCUREMENT_STATUS = "This status follows the payments and dates on the document.";

export function supplierQuotationTransitions(status: SupplierQuotationStatus, locked: boolean): SupplierQuotationStatus[] {
  if (locked || status === "ACCEPTED" || status === "REJECTED") return [];
  // markSupplierQuotationReceived() only accepts drafts.
  return status === "DRAFT" ? ["RECEIVED", "ACCEPTED", "REJECTED"] : ["ACCEPTED", "REJECTED"];
}

export function purchaseTransitions(status: PurchaseStatus): PurchaseStatus[] {
  return status === "DRAFT" ? ["RECEIVED"] : [];
}
