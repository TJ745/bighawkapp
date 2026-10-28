import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { db } from "@/lib/db";
import { runAsPlatform, runForCompany } from "@/lib/db/tenant";
import { dbIt, noDatabase, resetDatabase, startFreshDatabase } from "@/lib/test-support/database";
import { makeAccount, makeBranch, makeProduct, makeSettings, makeUser } from "@/lib/test-support/factories";
import { createSale } from "@/lib/business/pos";

/**
 * Two companies in one database.
 *
 * Everything else in the suite runs as a single company and would pass just as happily with the
 * filter switched off — which is the point of this file. It is the only place that asks the
 * question the feature exists to answer: **can one customer reach another's data?** It has to be
 * asked against a real Postgres, because half the answer is the foreign keys and the per-company
 * unique indexes, and neither of those exists in TypeScript.
 */

describe("two companies in one database", () => {
  /** The second company, set up alongside the one `resetDatabase` makes. */
  let other = "";
  let otherBranch = "";
  let otherAccount = "";
  let otherVariant = "";
  let otherCashier: { id: string; name: string };

  let branchId = "";
  let accountId = "";
  let cashier: { id: string; name: string };

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      branchId = (await makeBranch()).id;
      accountId = (await makeAccount()).id;
      const me = await makeUser();
      cashier = { id: me.id, name: me.name };

      const company = await runAsPlatform("test fixture: a second customer on the same database", () =>
        db.company.create({ data: { name: "Other Co", slug: `other-${Date.now()}` } }),
      );
      other = company.id;
      await runForCompany(other, async () => {
        await makeSettings();
        otherBranch = (await makeBranch()).id;
        otherAccount = (await makeAccount()).id;
        const them = await makeUser();
        otherCashier = { id: them.id, name: them.name };
        otherVariant = (await makeProduct({ name: "Their Widget", salePrice: 50, openingStock: 10, branchId: otherBranch })).variant.id;
      });
    }),
  );

  after(async () => {
    if (await noDatabase()) return;
    await resetDatabase();
  });

  /** A completed cash sale, for whichever company is in force. */
  async function sell(args: { branchId: string; accountId: string; variantId: string; cashier: { id: string; name: string } }) {
    return createSale({
      branchId: args.branchId,
      registerId: null,
      shiftId: null,
      customerId: null,
      cartDiscountPercent: 0,
      note: null,
      lines: [{ variantId: args.variantId, quantity: 1 }],
      payments: [{ paymentAccountId: args.accountId, method: "CASH", amount: 57.5 }],
      park: false,
      cashier: args.cashier,
      today: "2026-10-26",
      vatEnabled: true,
      defaultVatRate: 15,
    });
  }

  dbIt("does not show one company the other's rows", async () => {
    const mine = await makeProduct({ name: "My Widget", salePrice: 50, openingStock: 10, branchId });
    await sell({ branchId, accountId, variantId: mine.variant.id, cashier });
    await runForCompany(other, () =>
      sell({ branchId: otherBranch, accountId: otherAccount, variantId: otherVariant, cashier: otherCashier }),
    );

    const names = (await db.item.findMany({ select: { name: true } })).map((i) => i.name);
    assert.deepEqual(names, ["My Widget"]);
    assert.equal(await db.posSale.count(), 1);

    // And the other way round, so the test cannot pass by the filter simply over-narrowing.
    const theirs = await runForCompany(other, () => db.item.findMany({ select: { name: true } }));
    assert.deepEqual(theirs.map((i) => i.name), ["Their Widget"]);
  });

  dbIt("cannot read another company's row by its id, which is the whole risk", async () => {
    // Ids travel through URLs and form fields. Guessing or pasting one must lead nowhere.
    const theirSale = await runForCompany(other, () =>
      sell({ branchId: otherBranch, accountId: otherAccount, variantId: otherVariant, cashier: otherCashier }),
    );

    assert.equal(await db.posSale.findUnique({ where: { id: theirSale.id } }), null);
    assert.equal(await db.posSale.findFirst({ where: { id: theirSale.id } }), null);
    assert.equal(await db.posSale.count({ where: { id: theirSale.id } }), 0);
  });

  dbIt("cannot write to another company's row either", async () => {
    const theirSale = await runForCompany(other, () =>
      sell({ branchId: otherBranch, accountId: otherAccount, variantId: otherVariant, cashier: otherCashier }),
    );

    // `updateMany` reports how many rows it reached; the answer must be none.
    const touched = await db.posSale.updateMany({ where: { id: theirSale.id }, data: { note: "tampered" } });
    assert.equal(touched.count, 0);

    const untouched = await runForCompany(other, () => db.posSale.findUniqueOrThrow({ where: { id: theirSale.id } }));
    assert.equal(untouched.note, null);
  });

  dbIt("lets both companies have their own POS-0001, which is why the uniques are composite", async () => {
    // Before multi-tenancy a document number was unique across the whole database, so the second
    // customer to open a till would have been refused their own first sale. Two companies made
    // here rather than reused, because the point is what each one's *first* sale is numbered.
    const [x, y] = [await freshCompany(), await freshCompany()];
    const first = await runForCompany(x.companyId, () => sell(x));
    const second = await runForCompany(y.companyId, () => sell(y));

    assert.equal(first.number, second.number);
    // Each company sees exactly one sale carrying it: the same number, twice over, kept apart.
    assert.equal(await runForCompany(x.companyId, () => db.posSale.count({ where: { number: first.number } })), 1);
    assert.equal(await runForCompany(y.companyId, () => db.posSale.count({ where: { number: first.number } })), 1);
  });

  dbIt("scopes a query the caller never awaited inside the scope", async () => {
    /**
     * A Prisma call is lazy: it runs when it is awaited, not when it is written. A callback that
     * *returns* `db.x.find(…)` without awaiting it therefore used to execute after the scope had
     * been exited, under whatever company was in force outside — silently, with no error and
     * plausible-looking results. `runForCompany` awaits on the caller's behalf; this is the shape
     * that proves it.
     */
    const theirs = await runForCompany(other, () => db.branch.findMany({ select: { id: true } }));
    assert.deepEqual(theirs.map((b) => b.id), [otherBranch]);
  });

  dbIt("keeps each company's settings apart, now that they are no longer one row", async () => {
    await db.companySettings.update({ where: { companyId: await currentCompany() }, data: { companyName: "Mine" } });
    const theirs = await runForCompany(other, () => db.companySettings.findFirstOrThrow({}));
    assert.equal(theirs.companyName, "Test Co");
    assert.equal((await db.companySettings.findFirstOrThrow({})).companyName, "Mine");
  });

  dbIt("gives a company created through the app everything the seed gives the first one", async () => {
    /**
     * A `Company` row on its own is a shell. Without this an operator could onboard a customer
     * whose first administrator signs in to no roles, no modules and nowhere to sell from — and
     * nothing would say why.
     */
    const { seedCompanyDefaults } = await import("@/lib/platform/new-company");
    const fresh = await runAsPlatform("test fixture: onboarding a customer", () =>
      db.company.create({ data: { name: "Onboarded Ltd", slug: `onboarded-${Date.now()}` } }),
    );

    const adminEmail = `admin-${Date.now()}@onboarded.invalid`;
    await runForCompany(fresh.id, () =>
      seedCompanyDefaults("Onboarded Ltd", { name: "Their Admin", email: adminEmail, password: "Passw0rd123" }),
    );

    const setup = await runForCompany(fresh.id, async () => ({
      roles: await db.role.count(),
      permissions: await db.rolePermission.count(),
      modules: await db.moduleSetting.count(),
      branches: await db.branch.findMany({ select: { code: true, isDefault: true } }),
      companyName: (await db.companySettings.findFirstOrThrow({})).companyName,
      admin: await db.user.findFirst({
        where: { companyId: fresh.id },
        select: { email: true, branchId: true, isActive: true, role: { select: { name: true } } },
      }),
      credentials: await db.account.count({ where: { user: { companyId: fresh.id }, providerId: "credential" } }),
    }));

    assert.ok(setup.roles > 0, "a company with no roles cannot grant anybody anything");
    assert.ok(setup.permissions > 0);
    assert.equal(setup.modules, 2, "both product modules have a row, on or off");
    assert.deepEqual(setup.branches, [{ code: "MAIN", isDefault: true }]);
    assert.equal(setup.companyName, "Onboarded Ltd");

    /**
     * And somebody who can actually sign in. Both halves: `User` is the identity and `Account`
     * holds the credential BetterAuth checks, so a company with one and not the other is a
     * company nobody can get into — which looks exactly like a working one from the operator's
     * list.
     */
    assert.equal(setup.admin?.email, adminEmail);
    assert.equal(setup.admin?.role?.name, "Admin", "the first administrator is granted everything");
    assert.equal(setup.admin?.branchId, null, "whoever runs the company is not pinned to one shop");
    assert.equal(setup.admin?.isActive, true);
    assert.equal(setup.credentials, 1, "no credential row means nobody can sign in");

    // And none of it leaked: the company running this test still has its own, separate setup.
    const mine = await db.branch.findMany({ select: { id: true } });
    assert.equal(mine.length, 1, "the new company's branch is not in this one");
    assert.equal(mine[0].id, branchId);
  });

  dbIt("lets two companies both use the branch code MAIN", async () => {
    // Branch codes are unique per company. Globally unique, the second customer onboarded would
    // have been refused their own first branch.
    const { seedCompanyDefaults } = await import("@/lib/platform/new-company");
    const a = await runAsPlatform("test fixture", () => db.company.create({ data: { name: "A Ltd", slug: `a-${Date.now()}` } }));
    const b = await runAsPlatform("test fixture", () => db.company.create({ data: { name: "B Ltd", slug: `b-${Date.now()}` } }));

    const stamp = Date.now();
    await runForCompany(a.id, () => seedCompanyDefaults("A Ltd", { name: "A Admin", email: `a-admin-${stamp}@t.invalid`, password: "Passw0rd123" }));
    await runForCompany(b.id, () => seedCompanyDefaults("B Ltd", { name: "B Admin", email: `b-admin-${stamp}@t.invalid`, password: "Passw0rd123" }));

    const codes = await runAsPlatform("test check", () =>
      db.branch.findMany({ where: { companyId: { in: [a.id, b.id] } }, select: { code: true } }),
    );
    assert.deepEqual(codes, [{ code: "MAIN" }, { code: "MAIN" }]);
  });

  /** The company the surrounding `dbIt` is running as. */
  async function currentCompany() {
    const { currentCompanyId } = await import("@/lib/db/tenant");
    return currentCompanyId()!;
  }

  /** A brand-new customer, with just enough set up to ring something through a till. */
  async function freshCompany() {
    const company = await runAsPlatform("test fixture: another customer on the same database", () =>
      db.company.create({ data: { name: "Fresh Co", slug: `fresh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } }),
    );
    return runForCompany(company.id, async () => {
      await makeSettings();
      const branch = await makeBranch();
      const account = await makeAccount();
      const staff = await makeUser();
      const product = await makeProduct({ name: "Widget", salePrice: 50, openingStock: 5, branchId: branch.id });
      return {
        companyId: company.id,
        branchId: branch.id,
        accountId: account.id,
        variantId: product.variant.id,
        cashier: { id: staff.id, name: staff.name },
      };
    });
  }
});
