import type { TenantScope } from "./tenant";
import { isTenantModel } from "./tenant-models";

/**
 * The pieces the tenant filter is built from.
 *
 * Kept apart from `lib/db.ts` so they can be read and tested on their own: the rule that decides
 * what a query is narrowed to is worth being able to look at without a database attached. The
 * wiring lives in `lib/db.ts`, which is the only place with a client to re-dispatch against.
 *
 * Pure, and deliberately **not** `server-only`: there is nothing here but functions over plain
 * objects, and marking it server-only would push its tests into the slow database pass. The
 * client, the session and the secrets all live on the other side of that line, in `lib/db.ts`.
 */

/** Reads and writes whose `where` can simply be narrowed. */
export const WHERE_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
]);

/**
 * `findUnique` demands a unique key in `where` and rejects anything else, so it cannot be
 * narrowed in place — it is re-dispatched as its non-unique twin. Leaving it alone instead would
 * let an id belonging to one customer read a row belonging to another.
 */
export const UNIQUE_READS: Record<string, string> = { findUnique: "findFirst", findUniqueOrThrow: "findFirstOrThrow" };

export const CREATE_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

/**
 * Stamps the company onto a create payload, including nested creates.
 *
 * `companyId` is required and has no default, so `item.create({ data: { variants: { create: … } } })`
 * would be rejected by the database if only the top level were stamped. Walking the payload is
 * what lets the rest of the app keep writing nested creates exactly as it always has.
 *
 * `connect` is left alone on purpose: it points at rows that exist and already have a company.
 */
export function stampCreate(value: unknown, companyId: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => stampCreate(entry, companyId));
  if (!value || typeof value !== "object" || value instanceof Date) return value;

  const record = value as Record<string, unknown>;
  const stamped: Record<string, unknown> = { ...record };

  for (const [key, nested] of Object.entries(record)) {
    if (!nested || typeof nested !== "object" || nested instanceof Date) continue;
    const relation = nested as Record<string, unknown>;
    if (!("create" in relation) && !("createMany" in relation) && !("connectOrCreate" in relation)) continue;

    const next = { ...relation };
    if ("create" in next) next.create = stampCreate(next.create, companyId);
    if ("connectOrCreate" in next) next.connectOrCreate = stampCreate(next.connectOrCreate, companyId);
    if ("createMany" in next && next.createMany && typeof next.createMany === "object") {
      const many = { ...(next.createMany as Record<string, unknown>) };
      many.data = stampCreate(many.data, companyId);
      next.createMany = many;
    }
    stamped[key] = next;
  }

  // An explicit company wins: the seed and the platform sometimes say which one they mean.
  if (!("companyId" in stamped) && !("company" in stamped)) stamped.companyId = companyId;
  return stamped;
}

/** Narrows a `where` to one company, keeping whatever the caller already asked for. */
export function narrowWhere(args: Record<string, unknown>, companyId: string): Record<string, unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>;
  return { ...args, where: { ...where, companyId } };
}

/**
 * Spreads a compound unique key back into the fields it is made of.
 *
 * `findUnique({ where: { variantId_branchId: { variantId, branchId } } })` becomes a `findFirst`
 * when the filter re-dispatches it, and `findFirst` has no field called `variantId_branchId` —
 * that name exists only in the unique-key input. The pair it stands for is an ordinary filter,
 * so the key is unwrapped rather than the call being refused.
 *
 * Recognised by the name meaning exactly what it contains: the parts of `a_b` are the object's
 * own keys. Anything else is left alone, so a real field with an underscore is never touched.
 */
export function flattenCompoundKeys(where: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (!key.includes("_") || !value || typeof value !== "object" || Array.isArray(value)) {
      out[key] = value;
      continue;
    }
    const parts = key.split("_");
    const fields = Object.keys(value as Record<string, unknown>);
    const same = parts.length === fields.length && [...parts].sort().join("|") === [...fields].sort().join("|");
    if (!same) {
      out[key] = value;
      continue;
    }
    Object.assign(out, value);
  }
  return out;
}

export type TenantDecision =
  /** Not company-owned, or the platform is acting deliberately: run it untouched. */
  | { action: "pass" }
  /** Run the same operation with these arguments. */
  | { action: "narrow"; args: Record<string, unknown> }
  /** Run a *different* operation with these arguments — the findUnique rewrite. */
  | { action: "redispatch"; operation: string; args: Record<string, unknown> };

/**
 * What should happen to one query.
 *
 * Pure: it takes the model, operation, arguments and the scope in force and says what to do, so
 * the rule can be read and tested without a database or a request. Resolving the scope is the
 * caller's job — see `lib/db.ts` — because that part is asynchronous and this part is not.
 */
export function decide(model: string | undefined, operation: string, args: unknown, scope: TenantScope): TenantDecision {
  if (!isTenantModel(model)) return { action: "pass" };
  if (scope.kind === "platform") return { action: "pass" };

  const companyId = scope.companyId;
  const input = (args ?? {}) as Record<string, unknown>;

  if (operation in UNIQUE_READS) {
    const narrowed = narrowWhere(input, companyId);
    narrowed.where = flattenCompoundKeys(narrowed.where as Record<string, unknown>);
    return { action: "redispatch", operation: UNIQUE_READS[operation], args: narrowed };
  }
  if (operation === "upsert") {
    return { action: "narrow", args: { ...narrowWhere(input, companyId), create: stampCreate(input.create, companyId) } };
  }
  if (CREATE_OPERATIONS.has(operation)) {
    return { action: "narrow", args: { ...input, data: stampCreate(input.data, companyId) } };
  }
  if (WHERE_OPERATIONS.has(operation)) {
    return { action: "narrow", args: narrowWhere(input, companyId) };
  }
  return { action: "pass" };
}
