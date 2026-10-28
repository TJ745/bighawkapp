import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decide, flattenCompoundKeys, stampCreate } from "./tenant-filter";
import type { TenantScope } from "./tenant";

/**
 * The rule that decides what every query in the app is narrowed to.
 *
 * Worth pinning precisely, because its failures are silent in both directions: narrow too little
 * and a page shows another customer's invoices; narrow the wrong thing and a query returns
 * nothing with no error to follow. Neither announces itself.
 */

const ACME: TenantScope = { kind: "company", companyId: "acme" };
const PLATFORM: TenantScope = { kind: "platform", reason: "test" };

/** The arguments a decision produces, whatever kind of decision it was. */
function argsOf(model: string, operation: string, args: unknown, scope: TenantScope = ACME) {
  const decision = decide(model, operation, args, scope);
  return decision.action === "pass" ? (args as Record<string, unknown>) : decision.args;
}

describe("what the tenant filter does to a query", () => {
  it("narrows a read to the company in force", () => {
    const args = argsOf("Invoice", "findMany", { where: { status: "PAID" } });
    assert.deepEqual(args.where, { status: "PAID", companyId: "acme" });
  });

  it("narrows an update and a delete, so an id alone cannot reach another company's row", () => {
    // The dangerous case: ids are guessable and are passed in from the client all day long.
    for (const operation of ["update", "delete", "updateMany", "deleteMany"]) {
      const args = argsOf("Invoice", operation, { where: { id: "someone-elses" } });
      assert.deepEqual(args.where, { id: "someone-elses", companyId: "acme" }, operation);
    }
  });

  it("re-dispatches findUnique as findFirst, because a unique key leaves no room to narrow", () => {
    const decision = decide("Invoice", "findUnique", { where: { id: "x" } }, ACME);
    assert.equal(decision.action, "redispatch");
    assert.equal(decision.action === "redispatch" && decision.operation, "findFirst");
    assert.deepEqual(decision.action === "redispatch" && decision.args.where, { id: "x", companyId: "acme" });
  });

  it("spreads a compound key when it does, since findFirst has no such field", () => {
    // `variantId_branchId` exists only in the unique-key input; a findFirst rejects it outright.
    const decision = decide(
      "StockLevel",
      "findUnique",
      { where: { variantId_branchId: { variantId: "v1", branchId: "b1" } } },
      ACME,
    );
    assert.deepEqual(decision.action === "redispatch" && decision.args.where, {
      variantId: "v1",
      branchId: "b1",
      companyId: "acme",
    });
  });

  it("stamps the company onto a create", () => {
    const args = argsOf("Invoice", "create", { data: { number: "INV-1" } });
    assert.deepEqual(args.data, { number: "INV-1", companyId: "acme" });
  });

  it("stamps nested creates too, which have the same NOT NULL column to fill", () => {
    const args = argsOf("Invoice", "create", {
      data: { number: "INV-1", items: { create: [{ name: "A" }, { name: "B" }] } },
    });
    assert.deepEqual(args.data, {
      number: "INV-1",
      companyId: "acme",
      items: { create: [{ name: "A", companyId: "acme" }, { name: "B", companyId: "acme" }] },
    });
  });

  it("stamps both halves of an upsert: the row it may touch and the row it may write", () => {
    const args = argsOf("ModuleSetting", "upsert", { where: { id: "m1" }, update: { enabled: true }, create: { enabled: true } });
    assert.deepEqual(args.where, { id: "m1", companyId: "acme" });
    assert.deepEqual(args.create, { enabled: true, companyId: "acme" });
  });

  it("leaves a model that belongs to nobody alone", () => {
    // User, Session and Company are shared by the whole platform; filtering them by company
    // would hide the BigHawk operator, who belongs to none, from their own screens.
    const decision = decide("User", "findMany", { where: { isActive: true } }, ACME);
    assert.equal(decision.action, "pass");
  });

  it("stands down under the platform scope, and only then", () => {
    assert.equal(decide("Invoice", "findMany", {}, PLATFORM).action, "pass");
    assert.notEqual(decide("Invoice", "findMany", {}, ACME).action, "pass");
  });
});

describe("stampCreate", () => {
  it("lets an explicit company win, because the seed says which one it means", () => {
    const stamped = stampCreate({ name: "A", companyId: "other" }, "acme") as Record<string, unknown>;
    assert.equal(stamped.companyId, "other");
  });

  it("leaves a connect alone: it points at a row that already has a company", () => {
    const stamped = stampCreate({ name: "A", customer: { connect: { id: "c1" } } }, "acme") as Record<string, unknown>;
    assert.deepEqual(stamped.customer, { connect: { id: "c1" } });
  });

  it("does not mistake a Date for something to walk into", () => {
    const issuedAt = new Date("2026-10-26T00:00:00.000Z");
    const stamped = stampCreate({ issuedAt }, "acme") as Record<string, unknown>;
    assert.equal(stamped.issuedAt, issuedAt);
  });
});

describe("flattenCompoundKeys", () => {
  it("only unwraps a key that names exactly the fields it holds", () => {
    // A real field that happens to contain an underscore must survive untouched.
    const where = { some_field: { gt: 3 }, a_b: { a: 1, b: 2 } };
    assert.deepEqual(flattenCompoundKeys(where), { some_field: { gt: 3 }, a: 1, b: 2 });
  });

  it("ignores field order, which the compound name fixes and the caller does not", () => {
    assert.deepEqual(flattenCompoundKeys({ variantId_branchId: { branchId: "b", variantId: "v" } }), {
      branchId: "b",
      variantId: "v",
    });
  });
});
