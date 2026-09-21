import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";

// Financial summary shown on customer/supplier lists and profiles.
// Customers: invoiced (excluding drafts) / paid / outstanding.
// Suppliers: purchased / paid / outstanding (purchases arrive with the Procurement module).

export type PartyFinancials = { total: number; paid: number; outstanding: number };

const ZERO: PartyFinancials = { total: 0, paid: 0, outstanding: 0 };

export async function getCustomerFinancials(customerIds: string[]): Promise<Map<string, PartyFinancials>> {
  const result = new Map(customerIds.map((id) => [id, ZERO]));
  if (customerIds.length === 0) return result;
  const groups = await db.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customerIds }, status: { not: "DRAFT" } },
    _sum: { grandTotal: true, paidTotal: true },
  });
  for (const g of groups) {
    const total = num(g._sum.grandTotal);
    const paid = num(g._sum.paidTotal);
    result.set(g.customerId, { total, paid, outstanding: Math.max(0, total - paid) });
  }
  return result;
}

export async function getSupplierFinancials(supplierIds: string[]): Promise<Map<string, PartyFinancials>> {
  const result = new Map(supplierIds.map((id) => [id, ZERO]));
  if (supplierIds.length === 0) return result;
  const groups = await db.purchase.groupBy({
    by: ["supplierId"],
    where: { supplierId: { in: supplierIds }, status: { not: "DRAFT" } },
    _sum: { grandTotal: true, paidTotal: true },
  });
  for (const g of groups) {
    const total = num(g._sum.grandTotal);
    const paid = num(g._sum.paidTotal);
    result.set(g.supplierId, { total, paid, outstanding: Math.max(0, total - paid) });
  }
  return result;
}
