import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Which company the current request is acting for.
 *
 * Carried in async local storage rather than threaded through every call, because the alternative
 * — passing a `companyId` into all 85 models' worth of queries — is a filter somebody eventually
 * forgets, and a forgotten filter here shows one customer another's invoices.
 *
 * Nothing reads this directly. The Prisma extension in `lib/db.ts` does, on every query.
 */

export type TenantScope =
  /** Acting for one company: every tenant-owned query is filtered to it. */
  | { kind: "company"; companyId: string }
  /**
   * Acting as BigHawk itself — the seed, a migration, the operator listing companies.
   * Deliberately explicit and deliberately rare: it reads across every customer.
   */
  | { kind: "platform"; reason: string };

/**
 * One store for the whole process, kept on `globalThis` for the same reason the Prisma client is.
 *
 * A module-local store is only as reliable as the module being loaded once, and it is not: the
 * dev server re-evaluates modules on hot reload, and a bundler that resolves `@/lib/db/tenant`
 * and `./tenant` to separate instances gives the writer one store and the reader another. The
 * failure is silent and the worst kind — `runForCompany()` appears to do nothing, the filter
 * falls back to inferring a company from the request, and one customer is served another's data.
 * It was found exactly that way, against real data, after the tests had all passed.
 */
const globalForTenant = globalThis as unknown as { bighawkTenantStore?: AsyncLocalStorage<TenantScope> };
const storage = (globalForTenant.bighawkTenantStore ??= new AsyncLocalStorage<TenantScope>());

/**
 * Runs `work` with every tenant-owned query filtered to this company.
 *
 * The `await` inside is not a formality and must not be tidied away. A Prisma call is **lazy**:
 * `db.item.create(…)` builds a promise and runs nothing until something awaits it. Handing
 * `storage.run` a callback that merely *returns* that promise would therefore leave the query to
 * execute after this function has returned and the scope has been exited — quietly, as whatever
 * company was in force outside. Awaiting here starts the query while the scope still stands,
 * whatever shape the caller's callback takes.
 */
export function runForCompany<T>(companyId: string, work: () => Promise<T>): Promise<T> {
  return storage.run({ kind: "company", companyId }, async () => await work());
}

/**
 * Runs `work` unscoped, across every company.
 *
 * The `reason` is required so this never reads as an afterthought: anyone finding it in a stack
 * trace can see why the tenant filter was stood down.
 */
export function runAsPlatform<T>(reason: string, work: () => Promise<T>): Promise<T> {
  // Awaited inside for the same reason as `runForCompany` — see the note there.
  return storage.run({ kind: "platform", reason }, async () => await work());
}

export function currentScope(): TenantScope | undefined {
  return storage.getStore();
}

/** The company in force, or null when acting as the platform. Throws when nothing is in force. */
export function currentCompanyId(): string | null {
  const scope = storage.getStore();
  if (!scope) {
    throw new Error(
      "No tenant scope is in force. A query on company-owned data must run inside runForCompany() " +
        "or, deliberately, runAsPlatform(). This is thrown rather than guessed: guessing would mean " +
        "reading or writing some other customer's data.",
    );
  }
  return scope.kind === "company" ? scope.companyId : null;
}

/**
 * The company in force, insisting there is one — **only inside an explicit `runForCompany`**.
 *
 * Almost no app code qualifies. A request never puts a scope in the store: the tenant filter
 * resolves one per query, lazily, which is what lets a page be scoped by existing. So this reads
 * nothing and throws, and it did exactly that on every document number and every overdue sweep
 * while the whole test suite stayed green, because tests always wrap themselves in a scope.
 *
 * Anything that runs in a request wants `resolveCompanyId()` from `./tenant-scope`, which asks
 * the request the same way the filter does. `tenant-call-sites.test.ts` keeps them apart.
 */
export function requireCompanyId(): string {
  const companyId = currentCompanyId();
  if (!companyId) {
    throw new Error(
      "This query needs one company, and the platform scope spans them all. Wrap it in " +
        "runForCompany(), or pass the company explicitly.",
    );
  }
  return companyId;
}
