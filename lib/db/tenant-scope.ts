import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import type { TenantScope } from "./tenant";

/**
 * Which company *this request* is acting for, worked out from who is signed in.
 *
 * The alternative was a wrapper at every entry point — every page, every Server Action, every
 * layout — and the one somebody forgets is the one that reads another customer's data. Here the
 * filter asks instead of being told, so a new page is scoped by existing.
 *
 * `runForCompany()` / `runAsPlatform()` still win when they are in force: the seed, the test
 * harness and the operator's own screens have no session to read, and say what they mean.
 *
 * Cached per request, so the hundred-odd queries a page makes resolve the company once.
 */
export const scopeFromRequest = cache(async (): Promise<TenantScope | null> => {
  if (resolving.getStore()) {
    /**
     * Loud, because the alternative is silent. Re-entering means something on the sign-in path
     * queried a company-owned table outside the platform scope below; the memoised call would
     * then await itself and the request would hang with nothing in the log. It cost an
     * afternoon once. Put the new read inside that scope, or give it one of its own.
     */
    throw new Error(
      "Resolving the tenant scope re-entered itself. A query on company-owned data ran while the " +
        "session was being read — see lib/db/tenant-scope.ts.",
    );
  }
  return resolving.run(true, resolve);
});

/**
 * "This async context is already resolving the scope."
 *
 * Held in async local storage rather than a module-level flag: requests overlap, and a plain
 * boolean would have one request's resolution make another's throw.
 */
const resolving = new AsyncLocalStorage<boolean>();

async function resolve(): Promise<TenantScope | null> {
  // Imported late to break the cycle: this file is reached from `lib/db.ts`, which auth imports.
  const { getSessionUser } = await import("@/lib/auth/current-user");
  const { runAsPlatform } = await import("./tenant");

  /**
   * Reading the session is itself done **under the platform scope**, and that is not a detail.
   *
   * Working out who is signed in touches company-owned tables of its own — BetterAuth's session
   * hook reads the inactivity timeout from `AppSettings`. Without a scope in force that read
   * would come straight back here, to a memoised call that has not returned yet, and await
   * itself: the request simply stops, with no error and nothing in the log to explain it.
   *
   * Those few reads therefore run unscoped. They are reads *about* signing in, made before there
   * is a company to attribute them to; everything after this point is properly scoped, because
   * `getSessionUser` is memoised and answers the rest of the request from here.
   */
  const user = await runAsPlatform("working out which company this request acts for", getSessionUser);

  /**
   * What the address says, when the deployment is set up to serve more than one customer.
   *
   * This is what makes a second company reachable at all: before anybody signs in, it decides
   * whose login screen, branding and email settings to show.
   */
  const fromHost = await companyFromHost();

  /**
   * The address named a customer and there is no such customer.
   *
   * Nothing loads, rather than falling through to the deployment's own company: a subdomain
   * nobody owns must not quietly become somebody else's shop, complete with their name and logo
   * on the sign-in screen.
   */
  if (fromHost === "unknown") return null;

  if (user?.companyId) {
    /**
     * Both have an opinion, and they disagree. Serving either one would be wrong: the account
     * says this person works for one customer, the address says they came for another. Refusing
     * is the only safe answer — the alternative is handing somebody a working session against a
     * company they do not belong to.
     */
    if (fromHost && fromHost !== user.companyId) return null;
    return { kind: "company", companyId: user.companyId };
  }

  // Nobody signed in, or the BigHawk operator, who belongs to no company by design.
  if (fromHost) return { kind: "company", companyId: fromHost };

  /** The operator, having chosen a customer to work on. */
  const chosen = user?.isSuperAdmin ? await operatorsChosenCompany() : null;
  if (chosen) return { kind: "company", companyId: chosen };

  const companyId = await deploymentCompanyId();
  return companyId ? { kind: "company", companyId } : null;
}

/**
 * What the request's own address says.
 *
 * Three different answers, and the difference matters:
 *  - `null` — the address names no customer, so something else decides. `TENANT_BASE_DOMAIN`
 *    unset means host routing is off entirely, which is the honest state of most installs.
 *  - a company id — this customer.
 *  - `"unknown"` — the address named a customer and there is no such customer. **Not** the same
 *    as `null`: falling back there would serve a stranger's subdomain somebody else's shop.
 */
async function companyFromHost(): Promise<string | "unknown" | null> {
  const base = process.env.TENANT_BASE_DOMAIN;
  if (!base) return null;

  const { headers } = await import("next/headers");
  const { companySlugFromHost } = await import("@/lib/platform/tenant-host");
  const slug = companySlugFromHost((await headers()).get("host"), base);
  if (!slug) return null;

  const { db } = await import("@/lib/db");
  const { runAsPlatform } = await import("./tenant");
  const company = await runAsPlatform(`resolving the company for ${slug}`, () =>
    db.company.findFirst({ where: { slug, isActive: true }, select: { id: true } }),
  );
  return company?.id ?? "unknown";
}

/** The cookie the operator's company switcher sets, checked against a company that still exists. */
async function operatorsChosenCompany(): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const chosen = (await cookies()).get(OPERATOR_COMPANY_COOKIE)?.value;
  if (!chosen) return null;

  const { db } = await import("@/lib/db");
  const { runAsPlatform } = await import("./tenant");
  // Treated as a request, not permission — the same way a branch cookie is. A company that has
  // been deactivated or deleted since the operator picked it falls through to the default.
  const company = await runAsPlatform("operator acting for a chosen company", () =>
    db.company.findFirst({ where: { id: chosen, isActive: true }, select: { id: true } }),
  );
  return company?.id ?? null;
}

/** Which customer the BigHawk operator is currently working on. */
export const OPERATOR_COMPANY_COOKIE = "bighawk_company";

/**
 * The company a deployment serves when nothing else says which.
 *
 * The last resort, and correct for the common install: one deployment, one customer, no
 * `TENANT_BASE_DOMAIN`, nothing in the address to read. It is reached when the address names no
 * company, nobody is signed in, and the operator has not picked one.
 *
 * Ordered by `createdAt` so the answer is stable rather than whatever the database returns first.
 */
async function deploymentCompanyId(): Promise<string | null> {
  const { db } = await import("@/lib/db");
  const { runAsPlatform } = await import("./tenant");
  const company = await runAsPlatform("resolving the deployment's company for a signed-out visitor", () =>
    db.company.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } }),
  );
  return company?.id ?? null;
}

/**
 * The company in force, resolving it from the request when nothing explicit is set.
 *
 * The same answer the tenant filter itself works from, exposed for the few callers that need to
 * *name* the company rather than simply be filtered by it — chiefly anything memoised, which has
 * to be memoised per company as well as per request.
 */
export async function activeCompanyId(): Promise<string | null> {
  const { currentScope } = await import("./tenant");
  const scope = currentScope() ?? (await scopeFromRequest());
  return scope?.kind === "company" ? scope.companyId : null;
}

/**
 * The company in force, resolving it from the request, insisting there is one.
 *
 * **This is what app code must use**, not the synchronous `requireCompanyId`. The scope is
 * normally never put into the store at all: the tenant filter resolves it per query, lazily, so
 * that a page is scoped by existing. Hand-written SQL and per-company composite keys need the id
 * *as a value*, and reading the store directly finds nothing — which is how document numbering
 * and the overdue sweep came to throw on every request while every test passed, because tests
 * always wrap themselves in an explicit `runForCompany`.
 */
export async function resolveCompanyId(): Promise<string> {
  const companyId = await activeCompanyId();
  if (!companyId) {
    throw new Error(
      "This query needs one company and none could be worked out. It is running outside a " +
        "request and outside runForCompany(), or under runAsPlatform(), which spans every " +
        "customer and so cannot answer 'which company's row?'.",
    );
  }
  return companyId;
}
