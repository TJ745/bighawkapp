import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PermissionModule } from "@/lib/generated/prisma/enums";
import { PERMISSION_MODULES } from "./permissions";
import { visibleNavItems } from "@/components/layout/nav-config";

/**
 * Who can be granted what, and what they then see.
 *
 * Two bugs of the same family motivated these: `INVENTORY` existed as a permission but was missing
 * from the role editor, so it could only ever be granted by the seed; and every catalogue screen
 * sat under a nav section gated on `POS`, so a stock keeper could not reach Products from the
 * sidebar. Neither throws — a permission that cannot be granted and a page that cannot be found
 * both just quietly fail to exist.
 */

describe("the role editor can grant every permission", () => {
  it("lists every PermissionModule in the schema", () => {
    for (const value of Object.values(PermissionModule)) {
      assert.ok(
        PERMISSION_MODULES.some((m) => m.value === value),
        `PermissionModule.${value} is missing from PERMISSION_MODULES, so no administrator can ever grant it`,
      );
    }
  });

  it("does not list one twice", () => {
    const values = PERMISSION_MODULES.map((m) => m.value);
    assert.equal(new Set(values).size, values.length);
  });

  it("labels each one in words rather than in enum spelling", () => {
    for (const entry of PERMISSION_MODULES) {
      assert.ok(entry.label.trim(), `${entry.value} has no label`);
      assert.ok(!/_/.test(entry.label), `${entry.value} is labelled "${entry.label}", which is the enum, not English`);
    }
  });

  it("explains the POS jobs, because their names do not", () => {
    // "Till & sales" against "Tables & tabs" is not self-evident to someone ticking boxes.
    for (const entry of PERMISSION_MODULES.filter((m) => m.value.startsWith("POS"))) {
      assert.ok(entry.description?.trim(), `${entry.value} needs a description saying whose job it is`);
    }
  });
});

describe("what each job sees in the sidebar", () => {
  const ALL_CAPABILITIES = ["TABLES", "TABS", "KITCHEN", "APPOINTMENTS", "MODIFIERS", "RECIPES"] as const;

  /** The POS section's child titles for a user holding exactly these permissions. */
  function posEntries(visibleModules: PermissionModule[]) {
    const items = visibleNavItems({
      visibleModules,
      enabledModules: ["POS", "BUSINESS_MANAGEMENT"],
      capabilities: [...ALL_CAPABILITIES],
    });
    return items.find((item) => item.href === "/pos")?.children?.map((child) => child.title) ?? [];
  }

  it("shows a kitchen hand the board and nothing else", () => {
    /** The whole point of the split: no sales history, no takings, no floor plan. */
    assert.deepEqual(posEntries(["POS_KITCHEN"]), ["Kitchen"]);
  });

  it("shows a waiter the floor, and the kitchen only because they were granted it", () => {
    const waiter = posEntries(["POS_ORDERS", "POS_KITCHEN"]);
    assert.ok(waiter.includes("Tables"));
    assert.ok(waiter.includes("Tabs"));
    assert.ok(waiter.includes("Kitchen"));
    assert.ok(!waiter.includes("Sales"), "a waiter without till rights should not see the sales history");
    assert.ok(!waiter.includes("Shifts"));
  });

  it("keeps the kitchen board away from a cashier", () => {
    const cashier = posEntries(["POS", "INVENTORY"]);
    assert.ok(cashier.includes("Register"));
    assert.ok(cashier.includes("Shifts"));
    assert.ok(!cashier.includes("Kitchen"), "a cashier has no business on the kitchen board");
    assert.ok(!cashier.includes("Tables"));
  });

  it("shows a stock keeper the catalogue without any till permission", () => {
    // The second bug: these screens are INVENTORY pages that used to hide behind a POS-gated section.
    const keeper = posEntries(["INVENTORY"]);
    assert.ok(keeper.includes("Products & Services"));
    assert.ok(keeper.includes("Stock"));
    assert.ok(!keeper.includes("Register"), "maintaining stock is not permission to sell");
    assert.ok(!keeper.includes("Sales"));
  });

  it("hides the whole section from someone with no POS-side permission at all", () => {
    const items = visibleNavItems({ visibleModules: ["SALES"], enabledModules: ["POS", "BUSINESS_MANAGEMENT"], capabilities: [...ALL_CAPABILITIES] });
    assert.equal(
      items.find((item) => item.href === "/pos"),
      undefined,
    );
  });

  it("never shows a section with nothing in it", () => {
    /** Dropping the parent's own permission check is only safe while this holds. */
    for (const modules of [[], ["POS"], ["INVENTORY"], ["POS_KITCHEN"], ["SALES"], Object.values(PermissionModule)] as PermissionModule[][]) {
      for (const item of visibleNavItems({ visibleModules: modules, enabledModules: ["POS", "BUSINESS_MANAGEMENT"], capabilities: [...ALL_CAPABILITIES] })) {
        if (item.children) assert.ok(item.children.length > 0, `${item.title} rendered with no children for ${JSON.stringify(modules)}`);
      }
    }
  });

  it("still hides a section when the company has not bought the module", () => {
    // Permission is not subscription: an Admin of a Business-Management-only company sees no POS.
    const items = visibleNavItems({
      visibleModules: Object.values(PermissionModule),
      enabledModules: ["BUSINESS_MANAGEMENT"],
      capabilities: [...ALL_CAPABILITIES],
    });
    assert.equal(
      items.find((item) => item.href === "/pos"),
      undefined,
    );
  });

  it("still respects the branch's industry, not just the permission", () => {
    // A restaurant permission on a shop with no tables shows no floor plan.
    const noCapabilities = visibleNavItems({ visibleModules: ["POS_ORDERS", "POS_KITCHEN"], enabledModules: ["POS"], capabilities: [] });
    assert.equal(
      noCapabilities.find((item) => item.href === "/pos"),
      undefined,
      "with no capabilities there is nothing for those permissions to open",
    );
  });
});
