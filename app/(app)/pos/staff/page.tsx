import type { Metadata } from "next";
import { StaffManager } from "@/components/pos/staff-manager";
import { DateRangeFilter } from "@/components/shared/date-range-filter";
import { PageHeader } from "@/components/shared/page-header";
import { requirePosCapability } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getCurrentBranch } from "@/lib/data/platform";
import { today } from "@/lib/data/sales";
import { listStaff, staffCommission } from "@/lib/data/staff";
import { presetRange } from "@/lib/date-range";
import { parseDateRange } from "@/lib/validation/finance";

export const metadata: Metadata = { title: "Staff & commission" };

/** The team and what they are owed. Commission figures follow the same date range Finance uses. */
export default async function StaffPage({ searchParams }: PageProps<"/pos/staff">) {
  const auth = await requirePosCapability("STAFF_COMMISSION", "INVENTORY", "view");
  const [branch, todayDate, raw] = await Promise.all([getCurrentBranch(), today(), searchParams]);

  // Commission is usually read month by month, so that is where the page starts.
  const chosen = parseDateRange(raw as Record<string, string | string[] | undefined>);
  const month = presetRange("this-month", todayDate);
  const range = chosen.from || chosen.to ? chosen : { from: month.from, to: month.to };

  const [staff, commission, users] = await Promise.all([
    listStaff(branch.id),
    staffCommission(branch.id, range),
    db.user.findMany({ where: { isActive: true, isSuperAdmin: false }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);

  return (
    <>
      <PageHeader
        title="Staff & commission"
        description={`Who performs services at ${branch.name}, and what each one has earned.`}
        actions={<DateRangeFilter today={todayDate} defaultPreset="this-month" />}
      />
      <StaffManager
        staff={staff}
        users={users}
        commission={commission}
        rangeLabel={range.from && range.to ? `from ${range.from} to ${range.to}` : "to date"}
        branchName={branch.name}
        canCreate={auth.can("INVENTORY", "create")}
        canEdit={auth.can("INVENTORY", "edit")}
      />
    </>
  );
}
