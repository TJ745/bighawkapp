import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Which way app code asks for the company.
 *
 * There are two, and the difference is invisible at the call site:
 *
 *  - `requireCompanyId()` reads the scope **store**, and only an explicit `runForCompany()` ever
 *    puts anything there.
 *  - `resolveCompanyId()` asks the **request**, the same way the tenant filter does.
 *
 * A request never populates the store — the filter resolves per query, lazily, which is what lets
 * a page be scoped by existing. So the synchronous one throws in anything that runs in a request,
 * and it did: every document number and every overdue sweep, on every page load, while the whole
 * test suite stayed green, because tests always wrap themselves in a scope. Nothing in the engine
 * pass could have caught it. This can.
 */

const ROOT = process.cwd();

/** Where code runs inside a request and must therefore ask the request. */
const REQUEST_CODE = ["lib/business", "lib/data", "actions", "app"];

/** Where an explicit `runForCompany()` is always in force, so reading the store is correct. */
const ALLOWED = new Set(["lib/platform/new-company.ts", "lib/test-support/factories.ts"]);

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

describe("asking for the company", () => {
  const files = REQUEST_CODE.flatMap(sourceFiles);

  it("found the source to check", () => {
    assert.ok(files.length > 100, `expected to walk the app, found ${files.length} files`);
  });

  it("never reads the scope store from code that runs in a request", () => {
    const offenders = files
      .filter((file) => !ALLOWED.has(file.replace(/\\/g, "/")))
      .filter((file) => /\brequireCompanyId\b/.test(readFileSync(join(ROOT, file), "utf8")))
      .map((file) => file.replace(/\\/g, "/"));

    assert.deepEqual(
      offenders,
      [],
      "these run in a request, where the scope store is empty — use resolveCompanyId() from lib/db/tenant-scope",
    );
  });

  it("still allows it where a scope is genuinely in force", () => {
    // Not a formality: if these stopped using it the exemption list would be silently wrong.
    for (const file of ALLOWED) {
      const source = readFileSync(join(ROOT, file), "utf8");
      assert.match(source, /\brequireCompanyId\b/, `${file} no longer uses it; drop it from the exemption list`);
    }
  });
});
