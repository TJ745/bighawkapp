import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { decide } from "./db/tenant-filter";
import { isTenantModel } from "./db/tenant-models";
import { currentScope } from "./db/tenant";
import { scopeFromRequest } from "./db/tenant-scope";

// Single Prisma client per process. In development the module is re-evaluated
// on hot reload, so we cache the instance on globalThis to avoid exhausting
// the Neon connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof withTenantFilter> };

// Used only when DATABASE_URL is missing (e.g. during `next build` without env),
// so the client can be constructed and any real query fails with an obvious host name.
const MISSING_URL = "postgresql://missing:missing@DATABASE_URL-is-not-set.invalid:5432/missing";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn("[db] DATABASE_URL is not set. Add it to your .env file; database queries will fail.");
  }
  /**
   * `DATABASE_SCHEMA` points the whole app at a different Postgres schema in the same database.
   * Only the test harness sets it: the suite builds its own copy of every table under
   * `bighawk_test` so it can truncate freely, while real data in `public` is untouchable.
   */
  const schema = process.env.DATABASE_SCHEMA;
  /**
   * Two separate things have to be told about the schema, and missing either is silent:
   *
   *  - `{ schema }` qualifies the SQL **Prisma** generates.
   *  - `SET search_path` qualifies the SQL **we** write by hand. Without it a `$queryRaw` —
   *    document numbering's `FOR UPDATE` lock, the overdue sweep — resolves against `public`
   *    whatever Prisma was told, so the tests would read and write real data.
   *
   * It is set per connection rather than as a startup parameter because Neon's pooled endpoint
   * rejects `options`. `public` is deliberately left out: a table the test schema is missing
   * should fail loudly rather than quietly fall through to production.
   */
  if (schema) {
    /**
     * Two separate things have to be told about the schema, and missing either is silent:
     *
     *  - `{ schema }` qualifies the SQL **Prisma** generates.
     *  - `search_path` qualifies the SQL **we** write by hand. Without it a `$queryRaw` — document
     *    numbering's `FOR UPDATE` lock, the overdue sweep — resolves against `public` whatever
     *    Prisma was told, so the tests would read and write real data.
     *
     * `search_path` goes in as a **startup parameter**, which Neon accepts only on a direct
     * connection, so the pooled host is swapped for the direct one. Setting it per connection on
     * the pooled host looked equivalent and measurably was not: a query can reach a new
     * connection before its `SET` has run, read `public`'s numbering row, and then fail to update
     * a row that was never in this schema. A startup parameter cannot lose that race.
     *
     * The pool is kept small because the direct endpoint is not built for a burst of sockets the
     * way the pooler is — the concurrency this is tested under is a handful of tills, not a fleet.
     * It must still be larger than that handful: an interactive transaction holds its connection
     * for its whole life, so five concurrent sales against four connections leaves the fifth
     * unable to begin at all, which looks like a numbering fault and is not one.
     * `public` is deliberately left out of the path, so a table the test schema is missing fails
     * loudly rather than quietly finding production's.
     */
    const pool = new Pool({
      connectionString: (connectionString || MISSING_URL).replace("-pooler.", "."),
      options: `-c search_path="${schema}"`,
      max: 10,
      connectionTimeoutMillis: 20_000,
    });
    return new PrismaClient({
      adapter: new PrismaPg(pool, { schema }),
      log: ["error"],
      transactionOptions: { maxWait: 15_000, timeout: 30_000 },
    });
  }

  const adapter = new PrismaPg({ connectionString: connectionString || MISSING_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Document creation serialises on the numbering row lock; allow bursts to queue
    // for a pool slot instead of failing after Prisma's 2s default.
    transactionOptions: { maxWait: 15_000, timeout: 30_000 },
  });
}

/**
 * The client every query goes through, with the tenant filter attached.
 *
 * The extension narrows each company-owned query to the company in force and stamps each row
 * written with it — see `lib/db/tenant-filter.ts` for the rule. `findUnique` has to be
 * re-dispatched as `findFirst`, because Prisma rejects a non-unique field in its `where`; the
 * re-dispatch goes to the **base** client so it cannot loop back through the extension, and the
 * arguments handed over are already narrowed.
 */
function withTenantFilter(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantModel(model)) return query(args);

          /**
           * Either somebody said which company this is for, or it is worked out from who is
           * signed in. Refusing when it is neither is the whole point: running unfiltered here
           * does not mean "no results", it means another customer's data.
           */
          const scope = currentScope() ?? (await scopeFromRequest());
          if (!scope) {
            throw new Error(
              `A query on ${model} ran with no company in force and no session to infer one from. ` +
                `Wrap it in runForCompany(), or — if it genuinely spans every customer — in ` +
                `runAsPlatform() with a reason.`,
            );
          }

          const decision = decide(model, operation, args, scope);
          if (decision.action === "pass") return query(args);
          if (decision.action === "narrow") return query(decision.args);

          const delegate = (base as unknown as Record<string, Record<string, (a: unknown) => Promise<unknown>>>)[
            model[0].toLowerCase() + model.slice(1)
          ];
          return delegate[decision.operation](decision.args);
        },
      },
    },
  });
}

export type Db = ReturnType<typeof withTenantFilter>;

/**
 * The client handed to a `$transaction` callback.
 *
 * `Tx` describes the *unextended* client, so once the tenant filter is
 * attached it no longer matches — and a helper typed with it would quietly take an unfiltered
 * client. Derived from `Db` instead, so the filter travels into every transaction too.
 */
export type Tx = Omit<Db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const db: Db = globalForPrisma.prisma ?? withTenantFilter(createClient());

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
