import type { Metadata } from "next";
import { MembershipsManager } from "@/components/pos/memberships-manager";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { listMemberships, listMembershipPlans } from "@/lib/data/memberships";
import { getCurrentBranch } from "@/lib/data/platform";
import { listRegisterItems } from "@/lib/data/pos";
import { today } from "@/lib/data/sales";
import { getFormatters } from "@/lib/settings/formatters";

export const metadata: Metadata = { title: "Memberships" };

/** Plans the shop offers, and who is on one. Selling a plan happens at the till. */
export default async function MembershipsPage() {
  const auth = await requirePosCapability("MEMBERSHIPS", "INVENTORY", "view");
  const [branch, todayDate, format] = await Promise.all([getCurrentBranch(), today(), getFormatters()]);
  const [plans, members, items] = await Promise.all([listMembershipPlans(), listMemberships(branch.id, todayDate), listRegisterItems(branch.id)]);

  return (
    <>
      <PageHeader
        title="Memberships"
        description={`Plans at ${branch.name}. A plan is sold like any other service, and the till decides what it covers.`}
      />
      <MembershipsManager
        plans={plans}
        members={members.map((member) => ({
          id: member.id,
          customerName: member.customerName,
          planName: member.planName,
          startLabel: format.date(member.startDate),
          endLabel: format.date(member.endDate),
          sessionsIncluded: member.sessionsIncluded,
          sessionsUsed: member.sessionsUsed,
          sessionsLeft: member.sessionsLeft,
          discountPercent: member.discountPercent,
          status: member.status,
          saleNumber: member.saleNumber,
        }))}
        // Only services can sell or be covered by a plan: a bottle of shampoo is not a membership.
        services={items
          .filter((item) => item.kind === "SERVICE")
          .map((item) => ({ variantId: item.variantId, name: item.variantName ? `${item.name} — ${item.variantName}` : item.name }))}
        canCreate={auth.can("INVENTORY", "create")}
        canEdit={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
