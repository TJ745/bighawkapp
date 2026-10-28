import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { AUDIT_AREAS } from "@/lib/platform/audit-areas";

/**
 * Every audited action falls into an area the filter offers.
 *
 * The activity screen filters by the **prefix** of an action string, which is what keeps it from
 * needing a list of eighty-odd actions that would be stale by the next feature. The cost of that
 * choice is this: a new prefix nobody adds to `AREA_PREFIXES` is still written to the database
 * and still appears under "Everything", but can never be filtered for — the quietest possible
 * failure, because the screen looks like it is working.
 *
 * `AREA_PREFIXES` lives in the `server-only` query module, so it is read from the source rather
 * than imported; the labels beside it are client-safe and imported normally.
 */

const ROOT = process.cwd();

/**
 * What `lib/data/audit.ts` can filter by: the area names, and the prefixes each one covers.
 *
 * The two are not the same list — one area may cover several prefixes (the catalogue is written
 * as `item.`, `category.` and `modifier_group.`) — and conflating them is what the first draft
 * of this test did.
 */
function areaPrefixes(): { areas: Set<string>; prefixes: Set<string> } {
  const source = readFileSync(join(ROOT, "lib/data/audit.ts"), "utf8");
  const block = source.slice(source.indexOf("const AREA_PREFIXES"), source.indexOf("function whereFor"));
  return {
    areas: new Set([...block.matchAll(/^  ([a-z]+): \[/gm)].map((m) => m[1])),
    prefixes: new Set([...block.matchAll(/"([a-z_]+)\./g)].map((m) => m[1])),
  };
}

/** Every `action:` string literal written by a Server Action. */
function usedPrefixes(): Map<string, string> {
  const found = new Map<string, string>();
  for (const file of readdirSync(join(ROOT, "actions")).filter((f) => f.endsWith(".ts"))) {
    const source = readFileSync(join(ROOT, "actions", file), "utf8");
    // Only inside a recordAudit call: `action:` is also a permission argument elsewhere.
    for (const call of source.matchAll(/recordAudit\(\{[\s\S]{0,600}?\}\)/g)) {
      for (const match of call[0].matchAll(/action:[^,\n]*?"([a-z_]+)\.[a-z_]+"/g)) {
        found.set(match[1], `actions/${file}`);
      }
      // `action: \`${kind}.created\`` — the prefix is a variable, so the file names it instead.
      for (const match of call[0].matchAll(/action: `\$\{(\w+)\}\.[a-z_]+`/g)) {
        found.set(`<${match[1]}>`, `actions/${file}`);
      }
    }
  }
  return found;
}

describe("the activity filter covers what the app records", () => {
  const { areas, prefixes: known } = areaPrefixes();

  it("shows a pill for every area, and every pill filters something", () => {
    const labelled = new Set<string>(AUDIT_AREAS.map((area) => area.value).filter((value) => value !== "all"));
    assert.deepEqual([...areas].filter((a) => !labelled.has(a)), [], "these can be filtered but have no pill on the screen");
    assert.deepEqual([...labelled].filter((a) => !areas.has(a)), [], "these pills filter by nothing, so they always come back empty");
  });

  it("can filter every action the app actually writes", () => {
    const used = usedPrefixes();
    assert.ok(used.size > 10, `expected to find the audited actions, found ${used.size}`);

    const orphans = [...used.entries()]
      // A prefix built from a variable (`${kind}.created`) is checked by the case below.
      .filter(([prefix]) => !prefix.startsWith("<"))
      .filter(([prefix]) => !known.has(prefix))
      .map(([prefix, file]) => `${prefix}. (${file})`);

    assert.deepEqual(orphans, [], "these actions are recorded but fall into no area, so nobody can filter for them");
  });

  it("covers the two prefixes that are built from a variable", () => {
    // `actions/parties.ts` writes `customer.created` / `supplier.created` from its `kind`.
    for (const prefix of ["customer", "supplier"]) {
      assert.ok(known.has(prefix), `${prefix}. is written by actions/parties.ts but cannot be filtered`);
    }
  });
});
