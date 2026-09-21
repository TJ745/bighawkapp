import "server-only";
import { BusinessError } from "@/lib/auth/errors";
import { db } from "@/lib/db";
import { getAppSettings } from "@/lib/data/settings";
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, storeFile } from "@/lib/storage";
import type { Prisma } from "@/lib/generated/prisma/client";
import { num } from "@/lib/decimal";
import { today } from "@/lib/data/sales";
import { deriveInvoiceStatus } from "./sales-status";
import { calcLine, calcTotals, round2, type LineInput } from "./totals";

type ItemValues = LineInput & { description: string };

/** Turns validated form items into stored rows with authoritative line totals. */
export function buildItemRows(items: ItemValues[]) {
  const rows = items.map((item, index) => {
    const t = calcLine(item);
    return {
      sortOrder: index,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      vatRate: item.vatRate,
      lineSubtotal: t.subtotal,
      lineDiscount: t.discount,
      lineVat: t.vat,
      lineTotal: t.total,
    };
  });
  return { rows, totals: calcTotals(items) };
}

/** Applies Settings → VAT: when VAT is off or per-document changes are not allowed, force the default rate. */
export async function enforceVatPolicy<T extends { vatRate: number }>(items: T[]): Promise<T[]> {
  const settings = await getAppSettings();
  if (!settings.vatEnabled) return items.map((i) => ({ ...i, vatRate: 0 }));
  if (!settings.allowVatChange) return items.map((i) => ({ ...i, vatRate: settings.defaultVatRate }));
  return items;
}

export async function assertCustomerUsable(customerId: string) {
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true, isActive: true } });
  if (!customer) throw new BusinessError("Customer not found.");
  if (!customer.isActive) throw new BusinessError("This customer is inactive. Activate them first.");
}

/** A sales document may only link a project that belongs to the same customer. */
export async function assertProjectForCustomer(projectId: string | null, customerId: string) {
  if (!projectId) return;
  const project = await db.project.findUnique({ where: { id: projectId }, select: { customerId: true } });
  if (!project) throw new BusinessError("The linked project no longer exists.");
  if (project.customerId !== customerId) throw new BusinessError("The project belongs to a different customer.");
}

/** Reads the JSON payload and attachment files a document form submits as FormData. */
export function readDocumentFormData(formData: FormData) {
  const raw = formData.get("payload");
  let payload: unknown = {};
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new BusinessError("The form data could not be read. Please try again.");
    }
  }
  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0 && Boolean(f.name));
  return { payload, files };
}

export async function storeAttachments(folder: string, files: File[]) {
  const stored = [];
  for (const file of files) {
    const saved = await storeFile(file, folder, { allowedTypes: DOCUMENT_TYPES, maxBytes: MAX_DOCUMENT_BYTES });
    stored.push({ name: saved.name, fileKey: saved.key, mimeType: saved.mimeType, size: saved.size });
  }
  return stored;
}

/** Recomputes and stores paidTotal + status from the invoice's payments. The one place status is set. */
export async function refreshInvoice(tx: Prisma.TransactionClient, id: string) {
  const inv = await tx.invoice.findUniqueOrThrow({
    where: { id },
    select: { status: true, date: true, dueDate: true, grandTotal: true, depositAmount: true, sentAt: true },
  });
  const sum = await tx.invoicePayment.aggregate({ where: { invoiceId: id }, _sum: { amount: true } });
  const paidTotal = round2(num(sum._sum.amount));
  const status = deriveInvoiceStatus(
    { ...inv, grandTotal: num(inv.grandTotal), depositAmount: num(inv.depositAmount), paidTotal },
    await today(),
  );
  await tx.invoice.update({ where: { id }, data: { paidTotal, status } });
  return { paidTotal, status };
}
