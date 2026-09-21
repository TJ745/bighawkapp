import "server-only";
import { db } from "@/lib/db";
import type { PartyType } from "@/lib/generated/prisma/enums";
import { getCustomerFinancials, getSupplierFinancials, type PartyFinancials } from "@/lib/business/party-financials";
import { paginate, type ListParams } from "@/lib/list-params";
import { fileUrl } from "@/lib/storage";

export type PartyKind = "customer" | "supplier";

function listWhere(params: ListParams) {
  const type = params.filter === "company" ? "COMPANY" : params.filter === "individual" ? "INDIVIDUAL" : undefined;
  const q = params.q;
  return {
    ...(type ? { type: type as PartyType } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

const listSelect = { id: true, type: true, name: true, phone: true, email: true, isActive: true } as const;

export type PartyListItem = {
  id: string;
  type: PartyType;
  name: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  financials: PartyFinancials;
};

export async function listCustomers(params: ListParams): Promise<{ items: PartyListItem[]; total: number }> {
  const where = listWhere(params);
  const [rows, total] = await Promise.all([
    db.customer.findMany({ where, select: listSelect, orderBy: { name: "asc" }, ...paginate(params.page) }),
    db.customer.count({ where }),
  ]);
  const financials = await getCustomerFinancials(rows.map((r) => r.id));
  return { items: rows.map((r) => ({ ...r, financials: financials.get(r.id)! })), total };
}

export async function listSuppliers(params: ListParams): Promise<{ items: PartyListItem[]; total: number }> {
  const where = listWhere(params);
  const [rows, total] = await Promise.all([
    db.supplier.findMany({ where, select: listSelect, orderBy: { name: "asc" }, ...paginate(params.page) }),
    db.supplier.count({ where }),
  ]);
  const financials = await getSupplierFinancials(rows.map((r) => r.id));
  return { items: rows.map((r) => ({ ...r, financials: financials.get(r.id)! })), total };
}

const documentSelect = { id: true, category: true, name: true, fileKey: true, mimeType: true, size: true, createdAt: true } as const;

function withUrls<T extends { fileKey: string }>(docs: T[]) {
  return docs.map((d) => ({ ...d, url: fileUrl(d.fileKey) }));
}

export async function getCustomer(id: string) {
  const row = await db.customer.findUnique({
    where: { id },
    include: { documents: { select: documentSelect, orderBy: { createdAt: "desc" } } },
  });
  if (!row) return null;
  const financials = (await getCustomerFinancials([id])).get(id)!;
  return { ...row, documents: withUrls(row.documents), financials };
}

export async function getSupplier(id: string) {
  const row = await db.supplier.findUnique({
    where: { id },
    include: { documents: { select: documentSelect, orderBy: { createdAt: "desc" } } },
  });
  if (!row) return null;
  const financials = (await getSupplierFinancials([id])).get(id)!;
  return { ...row, documents: withUrls(row.documents), financials };
}

export type PartyDetail = NonNullable<Awaited<ReturnType<typeof getCustomer>>>;
export type PartyDocument = PartyDetail["documents"][number];

/** Lightweight options for pickers (quotations, invoices, projects…). */
export async function listCustomerOptions() {
  return db.customer.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, type: true },
  });
}

export async function listSupplierOptions() {
  return db.supplier.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, type: true },
  });
}

export type PartyOption = Awaited<ReturnType<typeof listCustomerOptions>>[number];
