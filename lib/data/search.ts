import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import type { AuthContext } from "@/lib/auth/session";

/**
 * Cross-module quick search for the ⌘K palette. Each group is only queried when the
 * user may view that module, so results can never reveal records they cannot open.
 */

export type SearchGroup = "customers" | "suppliers" | "quotations" | "invoices" | "supplierQuotations" | "purchases" | "projects";

export type SearchHit = {
  id: string;
  group: SearchGroup;
  title: string;
  subtitle: string;
  href: string;
  amount: number | null;
  status: string | null;
};

const TAKE = 5;

export async function globalSearch(query: string, auth: AuthContext): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const contains = { contains: q, mode: "insensitive" as const };

  const canCustomers = auth.can("CUSTOMERS", "view");
  const canSales = auth.can("SALES", "view");
  const canProcurement = auth.can("PROCUREMENT", "view");
  const canProjects = auth.can("PROJECTS", "view");

  const [customers, suppliers, quotations, invoices, supplierQuotations, purchases, projects] = await Promise.all([
    canCustomers
      ? db.customer.findMany({ where: { OR: [{ name: contains }, { phone: contains }, { email: contains }] }, take: TAKE, select: { id: true, name: true, phone: true, email: true } })
      : [],
    canProcurement
      ? db.supplier.findMany({ where: { OR: [{ name: contains }, { phone: contains }, { email: contains }] }, take: TAKE, select: { id: true, name: true, phone: true, email: true } })
      : [],
    canSales
      ? db.quotation.findMany({
          where: { OR: [{ number: contains }, { customer: { name: contains } }] },
          take: TAKE,
          orderBy: { date: "desc" },
          select: { id: true, number: true, status: true, grandTotal: true, customer: { select: { name: true } } },
        })
      : [],
    canSales
      ? db.invoice.findMany({
          where: { OR: [{ number: contains }, { customer: { name: contains } }] },
          take: TAKE,
          orderBy: { date: "desc" },
          select: { id: true, number: true, status: true, grandTotal: true, customer: { select: { name: true } } },
        })
      : [],
    canProcurement
      ? db.supplierQuotation.findMany({
          where: { OR: [{ number: contains }, { supplierReference: contains }, { supplier: { name: contains } }] },
          take: TAKE,
          orderBy: { date: "desc" },
          select: { id: true, number: true, status: true, grandTotal: true, supplier: { select: { name: true } } },
        })
      : [],
    canProcurement
      ? db.purchase.findMany({
          where: { OR: [{ number: contains }, { supplierReference: contains }, { supplier: { name: contains } }] },
          take: TAKE,
          orderBy: { date: "desc" },
          select: { id: true, number: true, status: true, grandTotal: true, supplier: { select: { name: true } } },
        })
      : [],
    canProjects
      ? db.project.findMany({
          where: { OR: [{ code: contains }, { name: contains }, { customer: { name: contains } }] },
          take: TAKE,
          orderBy: { startDate: "desc" },
          select: { id: true, code: true, name: true, status: true, value: true, customer: { select: { name: true } } },
        })
      : [],
  ]);

  return [
    ...customers.map((c) => ({
      id: c.id,
      group: "customers" as const,
      title: c.name,
      subtitle: [c.phone, c.email].filter(Boolean).join(" · "),
      href: `/customers/${c.id}`,
      amount: null,
      status: null,
    })),
    ...suppliers.map((s) => ({
      id: s.id,
      group: "suppliers" as const,
      title: s.name,
      subtitle: [s.phone, s.email].filter(Boolean).join(" · "),
      href: `/procurement/suppliers/${s.id}`,
      amount: null,
      status: null,
    })),
    ...quotations.map((r) => ({
      id: r.id,
      group: "quotations" as const,
      title: r.number,
      subtitle: r.customer.name,
      href: `/sales/quotations/${r.id}`,
      amount: num(r.grandTotal),
      status: r.status as string,
    })),
    ...invoices.map((r) => ({
      id: r.id,
      group: "invoices" as const,
      title: r.number,
      subtitle: r.customer.name,
      href: `/sales/invoices/${r.id}`,
      amount: num(r.grandTotal),
      status: r.status as string,
    })),
    ...supplierQuotations.map((r) => ({
      id: r.id,
      group: "supplierQuotations" as const,
      title: r.number,
      subtitle: r.supplier.name,
      href: `/procurement/supplier-quotations/${r.id}`,
      amount: num(r.grandTotal),
      status: r.status as string,
    })),
    ...purchases.map((r) => ({
      id: r.id,
      group: "purchases" as const,
      title: r.number,
      subtitle: r.supplier.name,
      href: `/procurement/purchases/${r.id}`,
      amount: num(r.grandTotal),
      status: r.status as string,
    })),
    ...projects.map((p) => ({
      id: p.id,
      group: "projects" as const,
      title: `${p.code} · ${p.name}`,
      subtitle: p.customer.name,
      href: `/projects/${p.id}`,
      amount: num(p.value),
      status: p.status as string,
    })),
  ];
}
