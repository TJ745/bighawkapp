import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PurchaseStatus, SupplierQuotationStatus } from "@/lib/generated/prisma/enums";
import { num } from "@/lib/decimal";
import { parseDateOnly } from "@/lib/dates";
import { paginate, type ListParams } from "@/lib/list-params";
import { mapAttachment, mapItem, today } from "./sales";

/** Persists time-based status changes (expired supplier quotations, overdue purchases). */
export async function refreshProcurementStatuses() {
  const todayDate = parseDateOnly(await today());
  await db.supplierQuotation.updateMany({
    where: { status: { in: ["DRAFT", "RECEIVED"] }, validUntil: { lt: todayDate } },
    data: { status: "EXPIRED" },
  });
  await db.purchase.updateMany({
    where: { status: { in: ["RECEIVED", "UNPAID", "PARTIALLY_PAID"] }, dueDate: { lt: todayDate } },
    data: { status: "OVERDUE" },
  });
}

const itemSelect = {
  id: true,
  sortOrder: true,
  description: true,
  quantity: true,
  unitPrice: true,
  discountPercent: true,
  vatRate: true,
  lineSubtotal: true,
  lineDiscount: true,
  lineVat: true,
  lineTotal: true,
} as const;

const attachmentSelect = { id: true, name: true, fileKey: true, mimeType: true, size: true, createdAt: true } as const;

const supplierSelect = {
  id: true,
  name: true,
  type: true,
  contactPerson: true,
  email: true,
  phone: true,
  address: true,
  vatNumber: true,
  crNumber: true,
  nationalAddress: true,
  isActive: true,
} as const;

export type DocumentSupplier = Prisma.SupplierGetPayload<{ select: typeof supplierSelect }>;

// ---------------------------------------------------------------------------
// Supplier quotations
// ---------------------------------------------------------------------------

const SQ_FILTERS: Record<string, SupplierQuotationStatus> = {
  draft: "DRAFT",
  received: "RECEIVED",
  accepted: "ACCEPTED",
  rejected: "REJECTED",
  expired: "EXPIRED",
};

function supplierQuotationWhere(params: ListParams, supplierId?: string): Prisma.SupplierQuotationWhereInput {
  const status = SQ_FILTERS[params.filter];
  return {
    ...(supplierId ? { supplierId } : {}),
    ...(status ? { status } : {}),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: "insensitive" } },
            { supplierReference: { contains: params.q, mode: "insensitive" } },
            { supplier: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listSupplierQuotations(params: ListParams, supplierId?: string) {
  await refreshProcurementStatuses();
  const where = supplierQuotationWhere(params, supplierId);
  const [rows, total] = await Promise.all([
    db.supplierQuotation.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      ...paginate(params.page),
      select: {
        id: true,
        number: true,
        supplierReference: true,
        date: true,
        validUntil: true,
        status: true,
        grandTotal: true,
        supplier: { select: { id: true, name: true } },
        purchase: { select: { id: true, number: true } },
      },
    }),
    db.supplierQuotation.count({ where }),
  ]);
  return { items: rows.map((r) => ({ ...r, grandTotal: num(r.grandTotal) })), total };
}

export type SupplierQuotationListItem = Awaited<ReturnType<typeof listSupplierQuotations>>["items"][number];

export async function getSupplierQuotation(id: string) {
  await refreshProcurementStatuses();
  const row = await db.supplierQuotation.findUnique({
    where: { id },
    include: {
      supplier: { select: supplierSelect },
      items: { select: itemSelect, orderBy: { sortOrder: "asc" } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
      purchase: { select: { id: true, number: true } },
    },
  });
  if (!row) return null;
  return {
    ...row,
    subtotal: num(row.subtotal),
    discountTotal: num(row.discountTotal),
    vatTotal: num(row.vatTotal),
    grandTotal: num(row.grandTotal),
    items: row.items.map(mapItem),
    attachments: row.attachments.map(mapAttachment),
  };
}

export type SupplierQuotationDetail = NonNullable<Awaited<ReturnType<typeof getSupplierQuotation>>>;

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

const PURCHASE_FILTERS: Record<string, PurchaseStatus> = {
  draft: "DRAFT",
  received: "RECEIVED",
  unpaid: "UNPAID",
  "partially-paid": "PARTIALLY_PAID",
  paid: "PAID",
  overdue: "OVERDUE",
};

function purchaseWhere(params: ListParams, scope?: { supplierId?: string; projectId?: string; customerId?: string }): Prisma.PurchaseWhereInput {
  const status = PURCHASE_FILTERS[params.filter];
  return {
    ...(scope?.supplierId ? { supplierId: scope.supplierId } : {}),
    ...(scope?.projectId ? { projectId: scope.projectId } : {}),
    ...(scope?.customerId ? { customerId: scope.customerId } : {}),
    ...(status ? { status } : {}),
    ...(params.q
      ? {
          OR: [
            { number: { contains: params.q, mode: "insensitive" } },
            { supplierReference: { contains: params.q, mode: "insensitive" } },
            { supplier: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

export async function listPurchases(params: ListParams, scope?: { supplierId?: string; projectId?: string; customerId?: string }) {
  await refreshProcurementStatuses();
  const where = purchaseWhere(params, scope);
  const [rows, total] = await Promise.all([
    db.purchase.findMany({
      where,
      orderBy: [{ date: "desc" }, { number: "desc" }],
      ...paginate(params.page),
      select: {
        id: true,
        number: true,
        supplierReference: true,
        date: true,
        dueDate: true,
        status: true,
        grandTotal: true,
        paidTotal: true,
        supplier: { select: { id: true, name: true } },
      },
    }),
    db.purchase.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({
      ...r,
      grandTotal: num(r.grandTotal),
      paidTotal: num(r.paidTotal),
      remaining: num(r.grandTotal) - num(r.paidTotal),
    })),
    total,
  };
}

export type PurchaseListItem = Awaited<ReturnType<typeof listPurchases>>["items"][number];

export async function getPurchase(id: string) {
  await refreshProcurementStatuses();
  const row = await db.purchase.findUnique({
    where: { id },
    include: {
      supplier: { select: supplierSelect },
      supplierQuotation: { select: { id: true, number: true } },
      customer: { select: { id: true, name: true } },
      project: { select: { id: true, code: true, name: true } },
      items: { select: itemSelect, orderBy: { sortOrder: "asc" } },
      attachments: { select: attachmentSelect, orderBy: { createdAt: "asc" } },
      payments: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: { paymentAccount: { select: { id: true, name: true } } },
      },
    },
  });
  if (!row) return null;
  const grandTotal = num(row.grandTotal);
  const paidTotal = num(row.paidTotal);
  return {
    ...row,
    subtotal: num(row.subtotal),
    discountTotal: num(row.discountTotal),
    vatTotal: num(row.vatTotal),
    grandTotal,
    paidTotal,
    remaining: grandTotal - paidTotal,
    items: row.items.map(mapItem),
    attachments: row.attachments.map(mapAttachment),
    payments: row.payments.map((p) => ({ ...p, amount: num(p.amount) })),
  };
}

export type PurchaseDetail = NonNullable<Awaited<ReturnType<typeof getPurchase>>>;

/** Payments made to one supplier (Supplier → Payments tab). */
export async function listSupplierPayments(supplierId: string) {
  const rows = await db.purchasePayment.findMany({
    where: { purchase: { supplierId } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: { purchase: { select: { id: true, number: true } }, paymentAccount: { select: { name: true } } },
  });
  return rows.map((p) => ({ ...p, amount: num(p.amount) }));
}

export type SupplierPaymentRow = Awaited<ReturnType<typeof listSupplierPayments>>[number];
