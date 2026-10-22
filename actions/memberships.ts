"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorizePosCapability } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getCurrentBranch } from "@/lib/data/platform";
import { recordAudit } from "@/lib/platform/audit";
import { cancelMembershipSchema, membershipPlanSchema } from "@/lib/validation/memberships";

/**
 * Membership plans and the memberships sold from them.
 *
 * Plans are `INVENTORY` work — they are part of what the shop offers, like the catalogue. Selling
 * one is not here at all: it happens at the till, as an ordinary sale of the plan's own item.
 */

function revalidateMemberships() {
  revalidatePath("/pos/memberships");
  revalidatePath("/pos/register");
}

/** A plan has to promise something, and has to be sold as a service. */
async function assertPlanMakesSense(data: { variantId: string; sessionCount: number; discountPercent: number; serviceVariantIds: string[] }) {
  if (data.sessionCount === 0 && data.discountPercent === 0) {
    throw new BusinessError("A plan has to give something: included sessions, a member discount, or both.");
  }

  const variant = await db.itemVariant.findUnique({
    where: { id: data.variantId },
    select: { id: true, item: { select: { name: true, kind: true } } },
  });
  if (!variant) throw new BusinessError("That product no longer exists.");
  if (variant.item.kind !== "SERVICE") {
    throw new BusinessError(`${variant.item.name} is a product. A plan is sold as a service, so the till treats it as one.`);
  }

  if (data.serviceVariantIds.includes(data.variantId)) {
    throw new BusinessError("A plan cannot cover the item that sells it.");
  }
  if (data.serviceVariantIds.length > 0) {
    const covered = await db.itemVariant.findMany({
      where: { id: { in: data.serviceVariantIds } },
      select: { id: true, item: { select: { name: true, kind: true } } },
    });
    if (covered.length !== new Set(data.serviceVariantIds).size) throw new BusinessError("One of the covered services no longer exists.");
    for (const service of covered) {
      if (service.item.kind !== "SERVICE") throw new BusinessError(`${service.item.name} is a product, so a membership cannot cover it.`);
    }
  }
}

export async function createMembershipPlan(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("MEMBERSHIPS", "INVENTORY", "create");
    const data = parseInput(membershipPlanSchema, input);
    const branch = await getCurrentBranch();
    await assertPlanMakesSense(data);

    const clash = await db.membershipPlan.findFirst({ where: { name: data.name }, select: { id: true } });
    if (clash) throw new BusinessError("A plan with this name already exists.");
    const sameItem = await db.membershipPlan.findFirst({ where: { variantId: data.variantId }, select: { name: true } });
    if (sameItem) throw new BusinessError(`${sameItem.name} is already sold by that item; one item sells one plan.`);

    const { serviceVariantIds, ...plan } = data;
    const created = await db.membershipPlan.create({
      data: { ...plan, services: { create: serviceVariantIds.map((variantId) => ({ variantId })) } },
      select: { id: true },
    });

    await recordAudit({
      auth,
      action: "pos.membership_plan_created",
      entity: "MembershipPlan",
      entityId: created.id,
      branchId: branch.id,
      summary: `Plan ${data.name}: ${data.durationDays} days, ${data.sessionCount} sessions, ${data.discountPercent}% off`,
    });
    revalidateMemberships();
    return { id: created.id };
  });
}

export async function updateMembershipPlan(planId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizePosCapability("MEMBERSHIPS", "INVENTORY", "edit");
    const data = parseInput(membershipPlanSchema, input);
    const branch = await getCurrentBranch();
    await assertPlanMakesSense(data);

    const plan = await db.membershipPlan.findUnique({ where: { id: planId }, select: { id: true } });
    if (!plan) throw new BusinessError("That plan no longer exists.");
    const clash = await db.membershipPlan.findFirst({ where: { name: data.name, id: { not: planId } }, select: { id: true } });
    if (clash) throw new BusinessError("A plan with this name already exists.");
    const sameItem = await db.membershipPlan.findFirst({ where: { variantId: data.variantId, id: { not: planId } }, select: { name: true } });
    if (sameItem) throw new BusinessError(`${sameItem.name} is already sold by that item; one item sells one plan.`);

    const { serviceVariantIds, ...rest } = data;
    await db.$transaction(async (tx) => {
      // The covered list is replaced wholesale, so the rows always match what was on screen.
      await tx.membershipPlanService.deleteMany({ where: { planId } });
      await tx.membershipPlan.update({
        where: { id: planId },
        data: { ...rest, services: { create: serviceVariantIds.map((variantId) => ({ variantId })) } },
      });
    });

    await recordAudit({
      auth,
      action: "pos.membership_plan_updated",
      entity: "MembershipPlan",
      entityId: planId,
      branchId: branch.id,
      summary: `Plan ${data.name} updated${data.isActive ? "" : " and withdrawn"}`,
    });
    revalidateMemberships();
  });
}

/**
 * Ends a membership early. The record stays — it was paid for, and what was used is history — so
 * this is a status change, never a delete. Money already taken is refunded at the till, like any
 * other refund.
 */
export async function cancelMembership(input: unknown): Promise<ActionResult<{ customerName: string }>> {
  return runAction(async () => {
    const auth = await authorizePosCapability("MEMBERSHIPS", "INVENTORY", "edit");
    const data = parseInput(cancelMembershipSchema, input);
    const branch = await getCurrentBranch();

    const membership = await db.membership.findUnique({
      where: { id: data.membershipId },
      select: { id: true, branchId: true, status: true, planName: true, customer: { select: { name: true } } },
    });
    if (!membership || membership.branchId !== branch.id) throw new BusinessError("That membership is not at this branch.");
    if (membership.status !== "ACTIVE") throw new BusinessError("That membership is not running.");

    await db.membership.update({ where: { id: membership.id }, data: { status: "CANCELLED" } });
    await recordAudit({
      auth,
      action: "pos.membership_cancelled",
      entity: "Membership",
      entityId: membership.id,
      branchId: branch.id,
      summary: `${membership.customer.name}'s ${membership.planName} cancelled — ${data.reason}`,
    });
    revalidateMemberships();
    return { customerName: membership.customer.name };
  });
}
