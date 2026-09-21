import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";

/**
 * Project overview numbers, calculated from linked transactions (drafts excluded):
 * Total Sales = invoiced, Total Paid = received against those invoices, Outstanding = sales − paid,
 * Total Purchases = purchases linked to the project, Estimated Profit = project value − purchases.
 */
export type ProjectFinancials = {
  value: number;
  totalSales: number;
  totalPurchases: number;
  totalPaid: number;
  outstanding: number;
  estimatedProfit: number;
};

export async function getProjectFinancials(projectIds: string[], values: Map<string, number>): Promise<Map<string, ProjectFinancials>> {
  const result = new Map<string, ProjectFinancials>();
  for (const id of projectIds) {
    const value = values.get(id) ?? 0;
    result.set(id, { value, totalSales: 0, totalPurchases: 0, totalPaid: 0, outstanding: 0, estimatedProfit: value });
  }
  if (projectIds.length === 0) return result;

  const [sales, purchases] = await Promise.all([
    db.invoice.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: { not: "DRAFT" } },
      _sum: { grandTotal: true, paidTotal: true },
    }),
    db.purchase.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: { not: "DRAFT" } },
      _sum: { grandTotal: true },
    }),
  ]);

  for (const g of sales) {
    if (!g.projectId) continue;
    const f = result.get(g.projectId)!;
    f.totalSales = num(g._sum.grandTotal);
    f.totalPaid = num(g._sum.paidTotal);
    f.outstanding = Math.max(0, f.totalSales - f.totalPaid);
  }
  for (const g of purchases) {
    if (!g.projectId) continue;
    const f = result.get(g.projectId)!;
    f.totalPurchases = num(g._sum.grandTotal);
  }
  for (const f of result.values()) f.estimatedProfit = f.value - f.totalPurchases;
  return result;
}
