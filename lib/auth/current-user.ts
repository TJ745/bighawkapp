import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "./auth";

/**
 * The signed-in user, with their role's permissions.
 *
 * Extracted so that **both** `lib/auth/session.ts` and `lib/data/platform.ts` can ask who is
 * signed in. Branch scoping needs the user inside `getCurrentBranch()`, and session.ts already
 * imports platform.ts — reading the user here instead of there is what keeps that from becoming a
 * circular import, without either file growing its own copy of the query.
 *
 * Cached per request, so asking twice costs one round trip.
 */
export const getSessionUser = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    include: { role: { include: { permissions: true } } },
  });
  // A deactivated account is signed out in effect, whatever cookie it still holds.
  return user && user.isActive ? user : null;
});

/**
 * The branches this user may work in, or **null** meaning every branch.
 *
 * Null rather than "all the ids" on purpose: a head-office user should not be re-pinned every time
 * a branch is opened, and the difference between "allowed everywhere" and "allowed at these three"
 * is one a caller must not lose. The Super Admin is always everywhere.
 */
export const allowedBranchIds = cache(async (): Promise<string[] | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  if (user.isSuperAdmin) return null;
  return user.branchId ? [user.branchId] : null;
});

/** Whether this user may work in a given branch. */
export async function canUseBranch(branchId: string): Promise<boolean> {
  const allowed = await allowedBranchIds();
  return allowed === null || allowed.includes(branchId);
}
