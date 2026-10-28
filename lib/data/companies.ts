import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { runAsPlatform } from "@/lib/db/tenant";
import { OPERATOR_COMPANY_COOKIE } from "@/lib/db/tenant-scope";

/**
 * Reads for the BigHawk operator's own screens.
 *
 * Every one of these runs under `runAsPlatform`, which is the whole point: this is the one place
 * in the app that is *supposed* to see across customers. Everywhere else, seeing across customers
 * is the bug this scope exists to prevent, so each call says why out loud.
 */

export type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: Date;
  /** Seats and shops this customer has bought, both counting the first of their kind. */
  userLimit: number;
  branchLimit: number;
  /**
   * Enough of a shape to tell a real customer from an empty shell. Users and branches count only
   * what is **in use**, so these read against the limits beside them — the quota checks count the
   * same way, and two figures that disagree would be worse than one.
   */
  users: number;
  branches: number;
  invoices: number;
  posSales: number;
};

export async function listCompanies(): Promise<CompanyRow[]> {
  const rows = await runAsPlatform("the operator listing every customer", () =>
    db.company.findMany({
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: { users: { where: { isActive: true } }, branchs: { where: { isActive: true } }, invoices: true, posSales: true },
        },
      },
    }),
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    createdAt: row.createdAt,
    userLimit: row.userLimit,
    branchLimit: row.branchLimit,
    users: row._count.users,
    branches: row._count.branchs,
    invoices: row._count.invoices,
    posSales: row._count.posSales,
  }));
}

/** Which customer the operator is working on right now, as the filter itself would answer. */
export async function actingCompanyId(): Promise<string | null> {
  const chosen = (await cookies()).get(OPERATOR_COMPANY_COOKIE)?.value;
  if (!chosen) return null;
  const company = await runAsPlatform("the operator's current company", () =>
    db.company.findFirst({ where: { id: chosen, isActive: true }, select: { id: true } }),
  );
  return company?.id ?? null;
}

/**
 * What the operator is looking at, for the strip that says so on every screen.
 *
 * Two states, and conflating them is how somebody edits the wrong customer's records:
 *
 *  - **Chosen.** They picked this company and everything they touch belongs to it.
 *  - **Not chosen.** Nothing has been picked, so the deployment falls back to its first
 *    company. The operator is sent to the companies screen to choose rather than being left
 *    looking at somebody's figures by accident.
 *
 * `null` only when the viewer is not the operator, or there is no company at all. It answers
 * even for a single-customer deployment: choosing is one click, and "which customer am I in"
 * should not be a question whose answer depends on how many you happen to have.
 */
export type OperatorContext = { companyName: string; chosen: boolean };

export async function operatorContext(): Promise<OperatorContext | null> {
  const [chosenId, companies] = await Promise.all([
    actingCompanyId(),
    runAsPlatform("telling the operator which customer is in force", () =>
      db.company.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    ),
  ]);

  const chosen = companies.find((company) => company.id === chosenId);
  if (chosen) return { companyName: chosen.name, chosen: true };
  if (companies.length === 0) return null;
  return { companyName: companies[0]?.name ?? "", chosen: false };
}
