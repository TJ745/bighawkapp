import "server-only";
import { it, type TestContext } from "node:test";
import { db } from "@/lib/db";
import { runForCompany } from "@/lib/db/tenant";

/**
 * A real database for the engine tests.
 *
 * The money engines open their own transactions, lock numbering rows and write through several
 * tables at once, so there is nothing honest to mock: a fake would be testing the fake. They run
 * against **Postgres**, in a schema of their own inside the same database as the app
 * (`DATABASE_SCHEMA`, default `bighawk_test`). Real data lives in `public` and is never touched —
 * the reset below truncates only the schema the tests own, and refuses to run against `public`.
 *
 * Set it up once with `npm run db:test:setup`. Until then the engine suites skip with a line
 * saying so, rather than failing and looking broken.
 */

export const TEST_SCHEMA = process.env.DATABASE_SCHEMA ?? "bighawk_test";

/** Tables are truncated in one statement, so foreign keys never dictate an order. */
let cachedTables: string[] | null = null;

async function tableNames(): Promise<string[]> {
  if (cachedTables) return cachedTables;
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = $1`,
    TEST_SCHEMA,
  );
  cachedTables = rows.map((r) => r.tablename).filter((t) => t !== "_prisma_migrations");
  return cachedTables;
}

let availability: Promise<string | null> | null = null;

/**
 * Why the engine tests cannot run, or null when they can.
 *
 * Returned as a sentence rather than a boolean so the skip message tells the reader what to do.
 */
export function databaseUnavailable(): Promise<string | null> {
  closePoolAtExit();
  availability ??= (async () => {
    if (TEST_SCHEMA === "public") return "refusing to run against the `public` schema";
    if (!process.env.DATABASE_URL) return "DATABASE_URL is not set";
    try {
      const tables = await tableNames();
      if (tables.length === 0) return `no tables in the \`${TEST_SCHEMA}\` schema — run \`npm run db:test:setup\` once`;
      return null;
    } catch (error) {
      return `could not reach the database (${error instanceof Error ? error.message : String(error)})`;
    }
  })();
  return availability;
}

/**
 * Empties every table the tests own.
 *
 * `TRUNCATE … CASCADE` in a single statement, so the order of foreign keys does not matter and
 * each test starts from genuinely nothing rather than from whatever the last one left behind.
 */
/**
 * The company the engine tests act for.
 *
 * Every tenant-owned row needs one, so the reset makes a fresh one and `dbIt` runs each test
 * inside it. A new company per reset rather than a fixed id, because that is what production
 * does and a test that only ever sees one hard-coded company id would not notice the filter
 * being dropped.
 */
let testCompanyId: string | null = null;

export function currentTestCompanyId(): string {
  if (!testCompanyId) throw new Error("No test company yet — call resetDatabase() in a before() hook.");
  return testCompanyId;
}

export async function resetDatabase(): Promise<void> {
  if (TEST_SCHEMA === "public") throw new Error("resetDatabase refuses to truncate the `public` schema.");
  const tables = await tableNames();
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${TEST_SCHEMA}"."${t}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  const company = await db.company.create({ data: { name: "Test Co", slug: `test-${Date.now()}` } });
  testCompanyId = company.id;
}

/**
 * Closes the pool once, when the whole run is over.
 *
 * The engine files share a single process (`--test-isolation=none`, so they cannot truncate each
 * other mid-transaction), which means a file must **not** disconnect in its own `after` — the next
 * file would find the pool shut. Registered once, on first use.
 */
let exitHooked = false;
export function closePoolAtExit(): void {
  if (exitHooked) return;
  exitHooked = true;
  process.once("beforeExit", () => {
    void db.$disconnect();
  });
}

/**
 * A test that needs the database, skipped with a reason when there is none.
 *
 * The decision has to be made *inside* the test: these files are CommonJS, so there is no
 * top-level `await` to resolve it before `describe` runs. Skipping beats failing — a suite that
 * goes red because nobody ran the setup teaches people to ignore red.
 */
export function dbIt(name: string, fn: (t: TestContext) => Promise<void>): void {
  it(name, async (t) => {
    const why = await databaseUnavailable();
    if (why) {
      t.skip(why);
      return;
    }
    // Every tenant-owned query inside the test is filtered to the company the reset made, the
    // same way a request is filtered to the company the signed-in user works for.
    await runForCompany(currentTestCompanyId(), () => fn(t));
  });
}

/** For `before`/`after` hooks: true when there is no database and the hook should do nothing. */
export async function noDatabase(): Promise<boolean> {
  return (await databaseUnavailable()) !== null;
}

/**
 * A `before` hook: skip when there is no database, otherwise start from nothing and build the
 * suite's fixtures **inside** the new company.
 *
 * The fixtures have to be scoped like the tests are — they write tenant-owned rows, and a row
 * written outside a company is a row the test can then never see.
 */
export async function startFreshDatabase(fixtures?: () => Promise<void>): Promise<void> {
  if (await noDatabase()) return;
  await resetDatabase();
  if (fixtures) await runForCompany(currentTestCompanyId(), fixtures);
}
