import type { Metadata } from "next";
import { AuditLog } from "@/components/settings/audit-log";
import { requirePermission } from "@/lib/auth/session";
import {
  auditUsers,
  auditUsersAcrossCompanies,
  listAuditEntries,
  listAuditEntriesAcrossCompanies,
  type AuditQuery,
} from "@/lib/data/audit";
import { actingCompanyId } from "@/lib/data/companies";
import { parseListParams } from "@/lib/list-params";
import { today } from "@/lib/data/sales";

export const metadata: Metadata = { title: "Activity" };

/**
 * Settings → Activity.
 *
 * `SETTINGS view` rather than a permission of its own: the trail says who changed what across
 * every module, so whoever reads it effectively sees the shape of the whole business. That is
 * administrator territory, and among the preset roles only Admin has it.
 *
 * The BigHawk operator gets the two things nobody else does: **every customer at once** while
 * they have singled none out, and their **own** work included either way. A customer's staff
 * see their colleagues' changes, not ours — the operator's entries still belong to the company
 * they affected, they are simply not that company's business to read.
 */
export default async function AuditPage({ searchParams }: PageProps<"/settings/audit">) {
  const auth = await requirePermission("SETTINGS", "view");
  const raw = await searchParams;

  const acrossCompanies = auth.user.isSuperAdmin && !(await actingCompanyId());
  const query: AuditQuery = {
    ...parseListParams(raw),
    from: typeof raw.from === "string" ? raw.from : "",
    to: typeof raw.to === "string" ? raw.to : "",
    userId: typeof raw.userId === "string" ? raw.userId : "all",
  };

  const [{ entries, total }, users, todayDate] = await Promise.all([
    acrossCompanies ? listAuditEntriesAcrossCompanies(query) : listAuditEntries(query, { includePlatform: auth.user.isSuperAdmin }),
    acrossCompanies ? auditUsersAcrossCompanies() : auditUsers(),
    today(),
  ]);

  return <AuditLog entries={entries} total={total} page={query.page} users={users} today={todayDate} acrossCompanies={acrossCompanies} />;
}
