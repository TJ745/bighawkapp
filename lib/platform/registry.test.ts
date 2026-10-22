import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { AppModule, PermissionModule, PosBusinessType } from "@/lib/generated/prisma/enums";
import { ALL_MODULES, APP_MODULES, appModuleOf, moduleLabel, permissionModulesFor } from "./modules";
import { CAPABILITY_LABELS, POS_BUSINESS_TYPES, POS_CAPABILITIES, POS_INDUSTRY_GROUPS, posTypeHasCapability, posTypeInfo, posTypeLabel } from "./pos-types";

/**
 * The platform registries.
 *
 * These two files decide what a company can reach: `appModuleOf` is what makes a switched-off
 * module close every page behind it, and a branch's capabilities decide which industry features
 * exist. A missing row here does not throw — it quietly grants or withholds a feature, which is
 * exactly the kind of mistake worth a test rather than a careful read.
 *
 * (`module` is avoided as a variable name throughout: Next forbids assigning to it.)
 */

/** Permission modules every company has, whatever it subscribes to. */
const CORE_PERMISSIONS: PermissionModule[] = ["USERS", "SETTINGS"];

describe("permission modules belong to a product module", () => {
  it("assigns every non-core permission module to a product module", () => {
    /**
     * This is the important one. A permission module with no owner is treated as core, so it stays
     * reachable with every module switched off — a paid feature given away, or worse, a POS screen
     * open to a company that never bought POS.
     */
    for (const permission of Object.values(PermissionModule)) {
      if (CORE_PERMISSIONS.includes(permission)) continue;
      const owner = appModuleOf(permission);
      assert.ok(owner, `PermissionModule.${permission} has no owning product module, so nothing closes it`);
      assert.ok(ALL_MODULES.includes(owner), `PermissionModule.${permission} is owned by ${owner}, which is not a product module`);
    }
  });

  it("leaves the core modules unowned, so they are always reachable", () => {
    // Users and Settings must survive every module being switched off, or nobody could switch one on.
    for (const permission of CORE_PERMISSIONS) {
      assert.equal(appModuleOf(permission), undefined, `${permission} must stay core`);
    }
  });

  it("puts selling and stock in POS, and the paperwork in Business Management", () => {
    assert.equal(appModuleOf("POS"), "POS");
    assert.equal(appModuleOf("INVENTORY"), "POS");
    for (const permission of ["CUSTOMERS", "SALES", "PROCUREMENT", "PROJECTS", "FINANCE"] as const) {
      assert.equal(appModuleOf(permission), "BUSINESS_MANAGEMENT", `${permission} should be Business Management`);
    }
  });
});

describe("permissionModulesFor", () => {
  it("offers only the core modules when nothing is subscribed", () => {
    assert.deepEqual(permissionModulesFor([]), CORE_PERMISSIONS);
  });

  it("offers POS's permissions but not Business Management's to a POS-only company", () => {
    const offered = permissionModulesFor(["POS"]);
    assert.ok(offered.includes("POS"));
    assert.ok(offered.includes("INVENTORY"));
    assert.ok(!offered.includes("SALES"), "a POS-only company should not be granting Sales rights");
    assert.ok(!offered.includes("FINANCE"));
  });

  it("offers the paperwork but not the till to a Business-Management-only company", () => {
    const offered = permissionModulesFor(["BUSINESS_MANAGEMENT"]);
    assert.ok(offered.includes("SALES"));
    assert.ok(!offered.includes("POS"), "a company without POS should not be granting till rights");
    assert.ok(!offered.includes("INVENTORY"));
  });

  it("always includes the core modules, whatever is subscribed", () => {
    for (const enabled of [[], ["POS"], ["BUSINESS_MANAGEMENT"], ALL_MODULES] as AppModule[][]) {
      for (const core of CORE_PERMISSIONS) {
        assert.ok(permissionModulesFor(enabled).includes(core), `${core} missing for ${JSON.stringify(enabled)}`);
      }
    }
  });

  it("offers every permission module once both are subscribed", () => {
    const offered = permissionModulesFor(ALL_MODULES);
    for (const permission of Object.values(PermissionModule)) {
      assert.ok(offered.includes(permission), `PermissionModule.${permission} is never offered in the role editor`);
    }
  });

  it("does not offer the same module twice", () => {
    const offered = permissionModulesFor(ALL_MODULES);
    assert.equal(new Set(offered).size, offered.length);
  });
});

describe("the product modules", () => {
  it("describes every module in the schema", () => {
    for (const value of Object.values(AppModule)) {
      assert.ok(
        APP_MODULES.some((m) => m.value === value),
        `AppModule.${value} has no entry, so the Modules screen cannot show it`,
      );
    }
  });

  it("says what each module includes, because that is what a customer loses by switching it off", () => {
    for (const info of APP_MODULES) {
      assert.ok(info.label.trim(), `${info.value} has no label`);
      assert.ok(info.description.trim(), `${info.value} has no description`);
      assert.ok(info.includes.length > 0, `${info.value} lists nothing it includes`);
    }
  });

  it("falls back to the raw value rather than showing nothing for an unknown module", () => {
    assert.equal(moduleLabel("POS"), "Point of Sale");
    assert.equal(moduleLabel("NOT_A_MODULE" as AppModule), "NOT_A_MODULE");
  });
});

describe("POS industries", () => {
  it("has a row for every industry in the schema", () => {
    /**
     * `posTypeInfo` falls back to the *last* row when it cannot find the type, so an industry
     * missing from the registry silently inherits whatever that row allows instead of failing.
     * Adding a value to the enum must therefore fail here until it has its own row.
     */
    for (const type of Object.values(PosBusinessType)) {
      assert.ok(
        POS_BUSINESS_TYPES.some((t) => t.value === type),
        `PosBusinessType.${type} has no row, so it would silently inherit another industry's capabilities`,
      );
    }
  });

  it("does not list an industry twice", () => {
    const values = POS_BUSINESS_TYPES.map((t) => t.value);
    assert.equal(new Set(values).size, values.length);
  });

  it("describes every industry", () => {
    for (const type of POS_BUSINESS_TYPES) {
      assert.ok(type.label.trim(), `${type.value} has no label`);
      assert.ok(type.description.trim(), `${type.value} has no description`);
      assert.ok(POS_INDUSTRY_GROUPS.includes(type.group), `${type.value} is in the unknown group "${type.group}"`);
    }
  });

  it("only grants capabilities that exist", () => {
    // A typo in a capability name would otherwise be a feature that never appears, silently.
    for (const type of POS_BUSINESS_TYPES) {
      for (const capability of type.capabilities) {
        assert.ok(POS_CAPABILITIES.includes(capability), `${type.value} grants "${capability}", which is not a capability`);
      }
    }
  });

  it("does not grant the same capability twice to one industry", () => {
    for (const type of POS_BUSINESS_TYPES) {
      assert.equal(new Set(type.capabilities).size, type.capabilities.length, `${type.value} repeats a capability`);
    }
  });

  it("gives every capability a label for the Modules screen", () => {
    for (const capability of POS_CAPABILITIES) {
      assert.ok(CAPABILITY_LABELS[capability]?.trim(), `${capability} has no label`);
    }
  });

  it("answers the capability question from the industry's own row", () => {
    // The only question feature code should ask — never `type === "RESTAURANT"`.
    for (const type of POS_BUSINESS_TYPES) {
      for (const capability of POS_CAPABILITIES) {
        assert.equal(
          posTypeHasCapability(type.value, capability),
          type.capabilities.includes(capability),
          `${type.value} answers wrongly about ${capability}`,
        );
      }
    }
  });

  it("names a known industry correctly", () => {
    assert.equal(posTypeLabel("RETAIL"), "General Retail");
    assert.equal(posTypeInfo("RETAIL").value, "RETAIL");
  });

  it("puts weighed goods where loose produce is sold and nowhere odd", () => {
    // The worked example from the docs: the scale layout appears only where WEIGHT does.
    assert.ok(posTypeHasCapability("GROCERY", "WEIGHT"));
    assert.ok(!posTypeHasCapability("APPAREL", "WEIGHT"));
  });

  it("keeps a floor plan out of industries that have no floor", () => {
    assert.ok(posTypeHasCapability("RESTAURANT", "TABLES"));
    assert.ok(!posTypeHasCapability("RETAIL", "TABLES"));
    assert.ok(!posTypeHasCapability("FOOD_TRUCK", "TABLES"));
  });
});

describe("every capability actually gates something", () => {
  /**
   * An audit found `BARCODE` and `VARIANTS` listed as capabilities while being referenced nowhere:
   * the Modules screen promised a difference between industries that the app never made. Nothing in
   * a type system catches that, because an unused string is perfectly valid — so it is checked by
   * looking for each capability's name in the code that would have to mention it.
   *
   * A rename or a move can make this fail honestly; the fix is to point it at the new place, not to
   * delete the check.
   */
  const ROOTS = ["actions", "app", "components", "lib"];
  const SKIP = new Set(["pos-types.ts", "enums.ts"]);

  function sourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "generated" ? [] : sourceFiles(full);
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts") || SKIP.has(entry.name)) return [];
      return [full];
    });
  }

  const haystack = ROOTS.filter((root) => fs.existsSync(root))
    .flatMap((root) => sourceFiles(root))
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");

  it("mentions each capability outside the registry that declares it", () => {
    for (const capability of POS_CAPABILITIES) {
      assert.ok(
        haystack.includes(`"${capability}"`),
        `the capability ${capability} is declared but never used, so every industry behaves identically for it`,
      );
    }
  });
});
