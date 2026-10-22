import "server-only";
import { db } from "@/lib/db";
import { num } from "@/lib/decimal";
import { refreshMembershipStatuses } from "@/lib/business/memberships";

/** Reads for the membership screens. Statuses are swept first, so nothing reads as active past its last day. */

export async function listMembershipPlans() {
  const plans = await db.membershipPlan.findMany({
    orderBy: { name: "asc" },
    include: {
      variant: { select: { id: true, name: true, salePrice: true, item: { select: { name: true, salePrice: true, kind: true } } } },
      services: { include: { variant: { select: { id: true, name: true, item: { select: { name: true } } } } } },
      _count: { select: { memberships: true } },
    },
  });

  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    variantId: plan.variantId,
    soldAs: plan.variant.name && plan.variant.name !== plan.variant.item.name ? `${plan.variant.item.name} — ${plan.variant.name}` : plan.variant.item.name,
    price: plan.variant.salePrice === null ? num(plan.variant.item.salePrice) : num(plan.variant.salePrice),
    durationDays: plan.durationDays,
    sessionCount: plan.sessionCount,
    discountPercent: num(plan.discountPercent),
    isActive: plan.isActive,
    memberCount: plan._count.memberships,
    services: plan.services.map((service) => ({
      variantId: service.variant.id,
      name: service.variant.name && service.variant.name !== service.variant.item.name ? `${service.variant.item.name} — ${service.variant.name}` : service.variant.item.name,
    })),
  }));
}

export type MembershipPlanRow = Awaited<ReturnType<typeof listMembershipPlans>>[number];

/** Who is a member, what they have left, and when it runs out. */
export async function listMemberships(branchId: string, today: string, options?: { activeOnly?: boolean }) {
  await refreshMembershipStatuses(today);

  const rows = await db.membership.findMany({
    where: { branchId, ...(options?.activeOnly ? { status: "ACTIVE" } : {}) },
    orderBy: [{ status: "asc" }, { endDate: "asc" }],
    take: 200,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      sale: { select: { number: true } },
      uses: { select: { sessions: true, returnedSessions: true } },
    },
  });

  return rows.map((row) => {
    const used = row.uses.reduce((sum, use) => sum + (use.sessions - use.returnedSessions), 0);
    return {
      id: row.id,
      customerId: row.customer.id,
      customerName: row.customer.name,
      customerPhone: row.customer.phone,
      planName: row.planName,
      startDate: row.startDate,
      endDate: row.endDate,
      sessionsIncluded: row.sessionsIncluded,
      sessionsUsed: used,
      /** null means unlimited for the period, which is what a plan with no sessions is. */
      sessionsLeft: row.sessionsIncluded === 0 ? null : Math.max(0, row.sessionsIncluded - used),
      discountPercent: num(row.discountPercent),
      price: num(row.price),
      status: row.status,
      saleNumber: row.sale?.number ?? null,
    };
  });
}

export type MembershipRow = Awaited<ReturnType<typeof listMemberships>>[number];
