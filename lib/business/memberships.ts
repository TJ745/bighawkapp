import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { num } from "@/lib/decimal";
import type { Prisma } from "@/lib/generated/prisma/client";
import { round2 } from "./totals";

/**
 * Memberships.
 *
 * What a member is entitled to is decided **here**, never by the till: the cashier may say "use the
 * membership", and the server answers whether it covers this service, whether a session is left,
 * and therefore what the line costs. A client that asks for a free haircut it is not owed is
 * refused, like any other price it might invent.
 *
 * Selling a plan is an ordinary POS sale of the plan's own item, so money, VAT, receipts and
 * Finance all go through the one path this app has. Only the entitlement lives in this file.
 */

export type MemberBenefit = {
  membershipId: string;
  planName: string;
  endDate: Date;
  sessionsIncluded: number;
  sessionsLeft: number | null;
  discountPercent: number;
  /** Which variants the plan covers; empty covers every service. */
  coveredVariantIds: string[];
};

/** The plan a sold line belongs to, when that line is a membership being bought. */
export type PlanForSale = {
  planId: string;
  name: string;
  durationDays: number;
  sessionCount: number;
  discountPercent: number;
};

/** The customer's live membership at this branch, or null. Expiry is by date, not by a flag. */
export async function getMemberBenefit(customerId: string | null, branchId: string, today: string): Promise<MemberBenefit | null> {
  if (!customerId) return null;
  const day = new Date(`${today}T00:00:00.000Z`);

  const membership = await db.membership.findFirst({
    where: { customerId, branchId, status: "ACTIVE", startDate: { lte: day }, endDate: { gte: day } },
    orderBy: { endDate: "desc" },
    include: {
      plan: { include: { services: { select: { variantId: true } } } },
      uses: { select: { sessions: true, returnedSessions: true } },
    },
  });
  if (!membership) return null;

  const used = membership.uses.reduce((sum, use) => sum + (use.sessions - use.returnedSessions), 0);
  return {
    membershipId: membership.id,
    planName: membership.planName,
    endDate: membership.endDate,
    sessionsIncluded: membership.sessionsIncluded,
    // No included sessions means unlimited within the period, which is what a gym plan is.
    sessionsLeft: membership.sessionsIncluded === 0 ? null : Math.max(0, membership.sessionsIncluded - used),
    discountPercent: num(membership.discountPercent),
    coveredVariantIds: membership.plan?.services.map((service) => service.variantId) ?? [],
  };
}

/** Whether the plan covers a variant. An empty service list covers every service. */
export function benefitCovers(benefit: MemberBenefit, variantId: string, isService: boolean) {
  if (!isService) return false;
  return benefit.coveredVariantIds.length === 0 || benefit.coveredVariantIds.includes(variantId);
}

export type MembershipPrice = { discountPercent: number; sessions: number; reason: string };

/**
 * What the membership does to one line, and why.
 *
 * A covered service takes a session and is free; once the sessions are gone (or the plan has none)
 * the plan's discount applies instead. Anything the plan does not cover is refused outright rather
 * than quietly charged in full — the cashier asked for the benefit, so they are told it is not there.
 */
export function applyBenefit(benefit: MemberBenefit, line: { variantId: string; quantity: number; isService: boolean; name: string }): MembershipPrice {
  if (!benefitCovers(benefit, line.variantId, line.isService)) {
    throw new BusinessError(`${benefit.planName} does not cover ${line.name}.`);
  }

  const wanted = Math.ceil(line.quantity);
  if (benefit.sessionsLeft === null) {
    return { discountPercent: 100, sessions: 0, reason: `${benefit.planName}: included` };
  }
  if (benefit.sessionsLeft >= wanted) {
    return { discountPercent: 100, sessions: wanted, reason: `${benefit.planName}: ${wanted} session${wanted === 1 ? "" : "s"} used` };
  }
  if (benefit.discountPercent > 0) {
    return { discountPercent: benefit.discountPercent, sessions: 0, reason: `${benefit.planName}: no sessions left, ${benefit.discountPercent}% member price` };
  }
  throw new BusinessError(`${benefit.planName} has no sessions left for ${line.name}.`);
}

/** Records the sessions a sold line took, so they can be put back if the sale is undone. */
export async function consumeMembership(
  tx: Prisma.TransactionClient,
  input: { membershipId: string; saleItemId: string; name: string; sessions: number },
) {
  if (input.sessions <= 0) return;
  await tx.membershipUse.create({
    data: { membershipId: input.membershipId, saleItemId: input.saleItemId, name: input.name, sessions: input.sessions },
  });
  await tx.membership.update({ where: { id: input.membershipId }, data: { sessionsUsed: { increment: input.sessions } } });
}

/**
 * Puts sessions back when a sale is voided or returned.
 *
 * `portion` is how much of the line is coming back: 1 for a void, returned ÷ sold for a partial
 * return. Sessions are whole things, so a part-return rounds up to whole sessions but can never
 * give back more than the line took. The row stays with what was given back on it, because "used
 * then returned" is a different story from "never used".
 */
export async function returnMembershipUse(tx: Prisma.TransactionClient, saleItemId: string, portion = 1) {
  if (portion <= 0) return;
  const use = await tx.membershipUse.findUnique({ where: { saleItemId } });
  if (!use) return;

  const outstanding = use.sessions - use.returnedSessions;
  if (outstanding <= 0) return;
  const giveBack = Math.min(outstanding, Math.max(1, Math.ceil(use.sessions * Math.min(1, portion))));

  await tx.membershipUse.update({ where: { id: use.id }, data: { returnedSessions: use.returnedSessions + giveBack } });
  await tx.membership.update({ where: { id: use.membershipId }, data: { sessionsUsed: { decrement: giveBack } } });
}

/** The plans sold by the variants in a cart, so selling one can start a membership. */
export async function getPlansForVariants(variantIds: string[]): Promise<Map<string, PlanForSale>> {
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const plans = await db.membershipPlan.findMany({
    where: { variantId: { in: ids }, isActive: true },
    select: { id: true, name: true, variantId: true, durationDays: true, sessionCount: true, discountPercent: true },
  });
  return new Map(
    plans.map((plan) => [
      plan.variantId,
      { planId: plan.id, name: plan.name, durationDays: plan.durationDays, sessionCount: plan.sessionCount, discountPercent: num(plan.discountPercent) },
    ]),
  );
}

/**
 * Starts (or extends) a membership because a plan was sold.
 *
 * Buying again while still a member adds the time to the end of what is already paid for, rather
 * than throwing away the remaining days — which is what a customer renewing early expects.
 */
export async function activateMembership(
  tx: Prisma.TransactionClient,
  input: { plan: PlanForSale; customerId: string; branchId: string; saleId: string; today: string; price: number; quantity: number },
) {
  const day = new Date(`${input.today}T00:00:00.000Z`);
  const periods = Math.max(1, Math.round(input.quantity));
  const days = input.plan.durationDays * periods;

  const existing = await tx.membership.findFirst({
    where: { customerId: input.customerId, branchId: input.branchId, planId: input.plan.planId, status: "ACTIVE", endDate: { gte: day } },
    orderBy: { endDate: "desc" },
  });

  if (existing) {
    const from = existing.endDate > day ? existing.endDate : day;
    await tx.membership.update({
      where: { id: existing.id },
      data: {
        endDate: new Date(from.getTime() + days * 24 * 60 * 60_000),
        sessionsIncluded: existing.sessionsIncluded + input.plan.sessionCount * periods,
        price: round2(num(existing.price) + input.price),
      },
    });
    return { id: existing.id, extended: true, planName: input.plan.name };
  }

  const membership = await tx.membership.create({
    data: {
      branchId: input.branchId,
      customerId: input.customerId,
      planId: input.plan.planId,
      planName: input.plan.name,
      startDate: day,
      endDate: new Date(day.getTime() + days * 24 * 60 * 60_000),
      sessionsIncluded: input.plan.sessionCount * periods,
      discountPercent: input.plan.discountPercent,
      price: input.price,
      saleId: input.saleId,
    },
    select: { id: true },
  });
  return { id: membership.id, extended: false, planName: input.plan.name };
}

/**
 * Marks memberships whose last day has passed. Run before reads, like the other status sweeps in
 * this app, so a list never shows something as active when its date says otherwise.
 */
export async function refreshMembershipStatuses(today: string) {
  await db.membership.updateMany({
    where: { status: "ACTIVE", endDate: { lt: new Date(`${today}T00:00:00.000Z`) } },
    data: { status: "EXPIRED" },
  });
}
