import "server-only";
import { db } from "@/lib/db";
import { runAsPlatform } from "@/lib/db/tenant";
import { paginate, type ListParams } from "@/lib/list-params";
// Re-exported so a caller needing both the queries and the labels has one import.
export { AUDIT_AREAS, type AuditArea, type AuditEntry };
import { currentCompanyUsers } from "@/lib/platform/user-scope";
import { AUDIT_AREAS, type AuditArea, type AuditEntry } from "@/lib/platform/audit-areas";
import type { Prisma } from "@/lib/generated/prisma/client";

/**
 * Reading the audit trail.
 *
 * Every consequential change in the app already wrote itself down through `recordAudit`; until
 * now nothing read any of it back, which made it a trail nobody could follow. These are the
 * queries behind Settings → Activity.
 *
 * Two audiences, one screen:
 *
 *  - a company's own administrator sees **their** company, filtered like everything else, and
 *  - the BigHawk operator sees the same screen for whichever company they are working on, or
 *    every company at once.
 *
 * The across-companies read is the only one that says `runAsPlatform`, and it refuses to run for
 * anybody but the operator — the caller proves that first.
 */

export type AuditQuery = ListParams & {
  /** `YYYY-MM-DD`, inclusive both ends; either may be blank. */
  from: string;
  to: string;
  /** A user id, or "all". */
  userId: string;
};

/**
 * Which action prefixes each area covers.
 *
 * A prefix rather than a list of actions: there are seventy-odd of them and a list would be out
 * of date by the next feature, quietly hiding whatever it forgot. An area that covers more than
 * one prefix says so here — catalogue work is written as `item.`, `category.` and
 * `modifier_group.`, which is a detail of the code rather than something to make a user learn.
 */
const AREA_PREFIXES: Record<Exclude<AuditArea, "all">, string[]> = {
  sales: ["sales."],
  customer: ["customer."],
  procurement: ["procurement."],
  finance: ["finance."],
  supplier: ["supplier."],
  pos: ["pos."],
  stock: ["stock."],
  item: ["item.", "category.", "modifier_group."],
  project: ["project."],
  branch: ["branch."],
  user: ["user.", "role."],
  settings: ["settings.", "module."],
  export: ["export."],
  platform: ["platform."],
};

function whereFor(query: AuditQuery): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];

  const prefixes = query.filter && query.filter !== "all" ? AREA_PREFIXES[query.filter as Exclude<AuditArea, "all">] : null;
  if (prefixes) and.push({ OR: prefixes.map((prefix) => ({ action: { startsWith: prefix } })) });

  if (query.userId && query.userId !== "all") and.push({ userId: query.userId });

  if (query.from || query.to) {
    and.push({
      createdAt: {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        // The chosen end date is included, so the window runs to the last moment of that day.
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      },
    });
  }

  if (query.q) {
    const contains = { contains: query.q, mode: "insensitive" as const };
    and.push({ OR: [{ summary: contains }, { userName: contains }, { entity: contains }, { action: contains }] });
  }

  // Every condition in its own `AND` entry, so one filter can never overwrite another's `OR`.
  return and.length > 0 ? { AND: and } : {};
}

/**
 * One company's trail — whichever company the request is scoped to.
 *
 * `includePlatform` decides whether BigHawk's own operator appears in it. Their work is recorded
 * against the company it affected, because that is where it means something, but a customer's
 * staff are shown their own colleagues' work rather than ours. The operator, looking at the same
 * screen while working on that company, sees everything.
 */
export async function listAuditEntries(
  query: AuditQuery,
  { includePlatform = false }: { includePlatform?: boolean } = {},
): Promise<{ entries: AuditEntry[]; total: number }> {
  const where = includePlatform ? whereFor(query) : { AND: [whereFor(query), { byPlatform: false }] };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...paginate(query) }),
    db.auditLog.count({ where }),
  ]);
  return { entries: rows.map((row) => ({ ...row, companyName: null })), total };
}

/**
 * Every company's trail at once, for the BigHawk operator.
 *
 * Separate from the scoped read rather than a flag on it, because looking across customers is
 * the thing the tenant filter exists to prevent: it should take a different function, named for
 * what it does, and say so to `runAsPlatform`.
 */
export async function listAuditEntriesAcrossCompanies(query: AuditQuery): Promise<{ entries: AuditEntry[]; total: number }> {
  const where = whereFor(query);
  return runAsPlatform("the operator reading every customer's activity", async () => {
    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...paginate(query),
        include: { company: { select: { name: true } } },
      }),
      db.auditLog.count({ where }),
    ]);
    return { entries: rows.map((row) => ({ ...row, companyName: row.company?.name ?? null })), total };
  });
}

/**
 * The people who appear in the filter.
 *
 * Taken from the users themselves rather than from distinct names in the log, so somebody who
 * has done nothing yet is still selectable and the list does not shuffle as work happens.
 */
export async function auditUsers(): Promise<{ id: string; name: string }[]> {
  return db.user.findMany({
    where: { ...(await currentCompanyUsers()) },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

/** The same list for the operator's across-companies view, with the company spelled out. */
export async function auditUsersAcrossCompanies(): Promise<{ id: string; name: string }[]> {
  return runAsPlatform("the operator filtering every customer's activity by person", async () => {
    // across-companies: the operator filters by a person who may work for any customer.
    const rows = await db.user.findMany({
      where: { isSuperAdmin: false },
      orderBy: [{ company: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, company: { select: { name: true } } },
    });
    return rows.map((row) => ({ id: row.id, name: row.company ? `${row.name} — ${row.company.name}` : row.name }));
  });
}
