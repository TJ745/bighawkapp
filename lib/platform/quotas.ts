import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { runAsPlatform } from "@/lib/db/tenant";
import { resolveCompanyId } from "@/lib/db/tenant-scope";
import { currentCompanyUsers } from "./user-scope";

/**
 * How many users and branches a customer has bought, and how many are in use.
 *
 * BigHawk is sold by the seat and by the shop, so the limits live on the `Company` row and only
 * the operator sets them. A customer sees the figure — "4 of 5 used" — because a button that
 * silently refuses is worse than one that explains itself, but they cannot move it.
 *
 * Two decisions are worth stating, because both are arbitrary until someone writes them down:
 *
 * - **The first of each kind counts.** Five users means five accounts including the
 *   administrator; five branches means five including MAIN. "Five plus one" is harder to sell
 *   and harder to explain than "five".
 * - **Only what is in use counts.** Deactivating somebody frees their seat, so a customer can
 *   replace a member of staff without calling us. Which is also why reactivating one has to go
 *   through the same check — otherwise the limit is one deactivate-and-reactivate away from
 *   meaningless.
 *
 * Lowering a limit below what is already in use is allowed, and nothing is switched off: the
 * refusals below simply stop anything *new* until usage comes back under the line. The app never
 * deactivates a customer's staff or shops on its own.
 */

export type Quota = {
  used: number;
  limit: number;
  /** Never negative: a limit lowered past current usage reads as nothing left, not as a debt. */
  remaining: number;
};

function quota(used: number, limit: number): Quota {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

async function limits(): Promise<{ userLimit: number; branchLimit: number }> {
  const companyId = await resolveCompanyId();
  // `Company` is not a tenant-owned model — it *is* the tenant — so this read says so out loud.
  const company = await runAsPlatform("reading a customer's purchased limits", () =>
    db.company.findUnique({ where: { id: companyId }, select: { userLimit: true, branchLimit: true } }),
  );
  if (!company) throw new BusinessError("This company no longer exists.");
  return company;
}

/** Seats bought against seats in use, for the company in force. */
export async function userQuota(): Promise<Quota> {
  const { userLimit } = await limits();
  // Filtered by hand: `User` is outside the tenant filter. See `user-scope.ts`.
  const used = await db.user.count({ where: { isActive: true, ...(await currentCompanyUsers()) } });
  return quota(used, userLimit);
}

/** Branches bought against branches in use, for the company in force. */
export async function branchQuota(): Promise<Quota> {
  const [{ branchLimit }, used] = await Promise.all([limits(), db.branch.count({ where: { isActive: true } })]);
  return quota(used, branchLimit);
}

/**
 * Refuses a new or reactivated user once the seats are gone.
 *
 * Called from the action, never relied on from the form: a hidden button is not a check, and
 * these two are the only places a seat can be taken.
 */
export async function assertUserSeatAvailable(): Promise<void> {
  const { used, limit } = await userQuota();
  if (used >= limit) {
    throw new BusinessError(
      `This company is set up for ${limit} ${limit === 1 ? "user" : "users"} and all ${limit} are in use. ` +
        `Deactivate someone who has left, or ask BigHawk to raise the limit.`,
    );
  }
}

/** The same rule for branches. */
export async function assertBranchSlotAvailable(): Promise<void> {
  const { used, limit } = await branchQuota();
  if (used >= limit) {
    throw new BusinessError(
      `This company is set up for ${limit} ${limit === 1 ? "branch" : "branches"} and all ${limit} are in use. ` +
        `Close one that is no longer trading, or ask BigHawk to raise the limit.`,
    );
  }
}
