import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Every `user` query names the company it means.
 *
 * `User` is the one well-used model the tenant filter does not narrow — its `companyId` is
 * nullable, because the BigHawk operator belongs to no company — so a user query is only as
 * scoped as the person who wrote it. Three were not, and none of them showed on screen while the
 * deployment served a single customer:
 *
 *  - `listUsers()` returned every company's staff,
 *  - a user created through the app was stamped with **no** company at all,
 *  - a notification picked its recipients across every customer, and emailed them.
 *
 * No engine test can see this: they run as one company, where an unscoped query and a scoped one
 * return exactly the same rows. Reading the source can, and does.
 */

const ROOT = process.cwd();
const SEARCHED = ["lib", "actions", "app", "components"];

/**
 * Queries that are right to leave unscoped, each for a reason that has to still be true.
 *
 * `email` is a platform-wide identity (it is how somebody signs in), so a clash must be found
 * wherever it lives. The auth and session lookups are by an id the server itself issued, not one
 * that arrived from a browser. The factory and the seed write their own scope.
 */
const EXEMPT = new Set([
  "lib/auth/auth.ts",
  "lib/auth/current-user.ts",
  "lib/auth/session.ts",
  "lib/test-support/factories.ts",
  "actions/auth.ts",
  "actions/profile.ts",
]);

/**
 * Looking an account up by email is deliberately unscoped wherever it appears: an address is a
 * platform-wide identity, so a clash has to be found in whichever customer holds it.
 */
const EXEMPT_LINES = [/where: \{ email[:\s}]/];

function sourceFiles(dir: string): string[] {
  const full = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(full);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const path = join(full, entry);
    if (statSync(path).isDirectory()) return sourceFiles(join(dir, entry));
    return /\.tsx?$/.test(entry) && !entry.endsWith(".test.ts") ? [join(dir, entry)] : [];
  });
}

/**
 * The two ways to leave a user query unscoped on purpose.
 *
 * Written above the query as `// across-companies: why` (the operator genuinely looking at every
 * customer) or `// own-account: why` (the signed-in person's own row, by an id the server issued
 * rather than one a browser sent). Either way it is something an author states in a sentence
 * rather than something that happens by omission, and `grep` finds every one of them.
 */
const DELIBERATE = /\/\/ (?:across-companies|own-account):/;

/** A `db.user.x(` / `tx.user.x(` call and the rest of its statement, however it is wrapped. */
function userQueries(source: string): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = [];
  const call = /\b(?:db|tx)\.user\.(findMany|findFirst|findUnique|count|create|createMany|update|updateMany|upsert)\b/g;
  let match: RegExpExecArray | null;
  while ((match = call.exec(source))) {
    // To the end of the call: balance brackets from the opening one.
    let depth = 0;
    let i = call.lastIndex;
    for (; i < source.length; i++) {
      if (source[i] === "(" || source[i] === "{") depth++;
      else if (source[i] === ")" || source[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    // Two lines of lead-in, so an admission written above the query counts as part of it.
    const before = source.slice(0, match.index).split("\n");
    found.push({
      line: before.length,
      text: before.slice(-3).join("\n") + source.slice(match.index, i + 1),
    });
  }
  return found;
}

describe("user queries name their company", () => {
  const files = SEARCHED.flatMap(sourceFiles);

  it("found the source to check", () => {
    assert.ok(files.length > 100, `expected to walk the app, found ${files.length} files`);
  });

  it("every user query is scoped, stamped, or exempt for a stated reason", () => {
    const offenders: string[] = [];

    for (const file of files) {
      const slug = file.replace(/\\/g, "/");
      if (EXEMPT.has(slug)) continue;
      const source = readFileSync(join(ROOT, file), "utf8");

      for (const query of userQueries(source)) {
        if (EXEMPT_LINES.some((pattern) => pattern.test(query.text))) continue;
        // The helper, the stamp it produced a line or two earlier, or a company written out
        // in full — onboarding knows the id because it just created the company.
        if (/currentCompanyUsers\(\)|companyStamp|companyId/.test(query.text)) continue;
        if (DELIBERATE.test(query.text)) continue;
        offenders.push(`${slug}:${query.line}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      "these read or write users without saying which company — spread currentCompanyUsers() from lib/platform/user-scope",
    );
  });

  it("the exemptions are still real", () => {
    // An exemption nobody uses any more is a hole waiting to be re-opened quietly.
    for (const file of EXEMPT) {
      const source = readFileSync(join(ROOT, file), "utf8");
      assert.match(source, /\b(?:db|tx)\.user\./, `${file} no longer queries users; drop it from the exemption list`);
    }
  });
});
