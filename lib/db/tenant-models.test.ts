import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { TENANT_MODELS, isTenantModel } from "./tenant-models";

/**
 * The registry the tenant filter trusts, checked against the schema itself.
 *
 * A model missing from `TENANT_MODELS` does not throw and does not return nothing — it returns
 * **every company's rows**, which is the one failure this whole feature exists to prevent and the
 * one a passing page would never reveal. So the list is not maintained by hand and hoped over: it
 * is compared, model by model, with `prisma/schema.prisma`.
 *
 * Reading the schema text rather than the generated client keeps this in the fast unit pass and
 * makes it answer the right question — what the database is declared to hold, not what some
 * artefact was last generated from.
 */

const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

/** `{ CompanySettings: "companyId String", … }` — every model and the body it declares. */
function modelBodies(): Map<string, string> {
  const bodies = new Map<string, string>();
  const pattern = /^model (\w+) \{([\s\S]*?)^\}/gm;
  for (const match of schema.matchAll(pattern)) bodies.set(match[1], match[2]);
  return bodies;
}

const bodies = modelBodies();
const hasCompanyId = (body: string) => /^\s*companyId\s+String(?!\?)/m.test(body);
const hasNullableCompanyId = (body: string) => /^\s*companyId\s+String\?/m.test(body);
const clientName = (model: string) => model[0].toLowerCase() + model.slice(1);

describe("the tenant registry", () => {
  it("found the schema", () => {
    assert.ok(bodies.size > 50, `expected to parse the schema's models, got ${bodies.size}`);
  });

  it("lists every model that carries a required companyId", () => {
    const missing = [...bodies]
      .filter(([, body]) => hasCompanyId(body))
      .map(([model]) => clientName(model))
      .filter((name) => !TENANT_MODELS.has(name));
    assert.deepEqual(
      missing,
      [],
      "these models are company-owned but the filter does not know it, so their rows are read across every customer",
    );
  });

  it("lists nothing that is not company-owned", () => {
    const names = new Map([...bodies.keys()].map((m) => [clientName(m), m]));
    const wrong = [...TENANT_MODELS].filter((name) => {
      const model = names.get(name);
      return !model || !hasCompanyId(bodies.get(model)!);
    });
    assert.deepEqual(wrong, [], "these are listed as company-owned but have no required companyId column");
  });

  it("leaves a nullable companyId out, because it cannot be filtered by one", () => {
    // `User` is the case: the BigHawk operator works for no company. Filtering those by hand,
    // where the intent is visible, beats a filter that silently hides the operator from itself.
    for (const [model, body] of bodies) {
      if (!hasNullableCompanyId(body)) continue;
      assert.ok(
        !TENANT_MODELS.has(clientName(model)),
        `${model}.companyId is nullable, so the filter would hide its company-less rows from everyone`,
      );
    }
  });

  it("matches on the name Prisma hands the extension, not the client property", () => {
    // The extension is given `PosSale`; the registry holds `posSale`. Getting this backwards
    // disables the filter for every model at once and nothing else notices.
    assert.equal(isTenantModel("PosSale"), true);
    assert.equal(isTenantModel("Company"), false);
    assert.equal(isTenantModel("User"), false);
    assert.equal(isTenantModel(undefined), false);
  });
});
