import assert from "node:assert/strict";
import { before, describe } from "node:test";
import { db } from "@/lib/db";
import { runForCompany } from "@/lib/db/tenant";
import { currentTestCompanyId, dbIt, startFreshDatabase } from "@/lib/test-support/database";
import { makeBranch, makeSettings, makeUser } from "@/lib/test-support/factories";
import { recordAudit } from "@/lib/platform/audit";
import { listAuditEntries } from "@/lib/data/audit";
import { assertBranchSlotAvailable, assertUserSeatAvailable, branchQuota, userQuota } from "@/lib/platform/quotas";
import type { AuthContext } from "@/lib/auth/session";

/**
 * What BigHawk's own operator may do inside a customer's company, and what the customer sees.
 *
 * Both rules here fail **silently** if they break, which is why they are pinned against a real
 * database rather than left to the one live check that proved them:
 *
 *  - The operator's work is recorded against the company it affected but hidden from that
 *    company's staff. Get it backwards and a customer reads somebody else's name in their own
 *    activity log, or the operator's changes vanish from the only log that holds them. Neither
 *    shows up as an error.
 *  - A seat limit that stops counting is a limit nobody notices is gone until a customer has
 *    twice what they paid for.
 */

/** Enough of an `AuthContext` for `recordAudit`, which only reads the user. */
function actorFor(user: { id: string; name: string }, isSuperAdmin: boolean): AuthContext {
  return { user: { ...user, isSuperAdmin } } as unknown as AuthContext;
}

describe("the operator inside a customer's company", () => {
  let companyId = "";
  let staff: { id: string; name: string };

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      await makeBranch();
      const user = await makeUser("Their Bookkeeper");
      staff = { id: user.id, name: user.name };
      companyId = currentTestCompanyId();
    }),
  );

  const everything = { q: "", filter: "all", page: 1, from: "", to: "", userId: "all" };

  dbIt("hides the operator's own work from the company's staff, and shows it to the operator", async () => {
    await recordAudit({ auth: actorFor(staff, false), action: "settings.updated", entity: "Settings", summary: "Bookkeeper changed VAT" });
    await recordAudit({ auth: actorFor({ id: staff.id, name: "Super Admin" }, true), action: "settings.updated", entity: "Settings", summary: "Operator changed VAT" });

    const theirs = await listAuditEntries(everything);
    const ours = await listAuditEntries(everything, { includePlatform: true });

    assert.deepEqual(
      theirs.entries.map((e) => e.summary),
      ["Bookkeeper changed VAT"],
      "a customer is shown their own colleagues' work, never BigHawk's",
    );
    assert.equal(ours.total, 2, "the operator sees both, on the same screen");
    assert.equal(theirs.total, 1, "the count is filtered too, or the pager promises rows it will not show");
  });

  dbIt("still files the operator's entry against the company it affected", async () => {
    // Hidden from them is not the same as filed somewhere else: it is their record, and the
    // only log in which "their VAT rate was changed" means anything.
    const row = await db.auditLog.findFirst({ where: { summary: "Operator changed VAT" }, select: { companyId: true, byPlatform: true } });
    assert.equal(row?.companyId, companyId);
    assert.equal(row?.byPlatform, true);
  });

  dbIt("counts seats and refuses the one past the limit", async () => {
    // One user exists from the fixture. Sold two, so one more fits and the third does not.
    await db.company.update({ where: { id: companyId }, data: { userLimit: 2 } });

    assert.deepEqual(await userQuota(), { used: 1, limit: 2, remaining: 1 });
    await assertUserSeatAvailable();

    await makeUser("Second Person");
    assert.deepEqual(await userQuota(), { used: 2, limit: 2, remaining: 0 });
    await assert.rejects(assertUserSeatAvailable, /all 2 are in use/);
  });

  dbIt("frees a seat when somebody is deactivated, because that is how staff are replaced", async () => {
    const leaver = await db.user.findFirstOrThrow({ where: { companyId, name: "Second Person" }, select: { id: true } });
    await db.user.update({ where: { id: leaver.id }, data: { isActive: false } });

    assert.deepEqual(await userQuota(), { used: 1, limit: 2, remaining: 1 });
    await assertUserSeatAvailable();
  });

  dbIt("never reports a negative remainder when a limit is lowered below what is in use", async () => {
    // Allowed on purpose: nothing of the customer's is switched off, new ones are simply refused.
    await db.company.update({ where: { id: companyId }, data: { userLimit: 1, branchLimit: 0 } });

    assert.deepEqual(await userQuota(), { used: 1, limit: 1, remaining: 0 });
    assert.deepEqual(await branchQuota(), { used: 1, limit: 0, remaining: 0 }, "remaining floors at zero rather than going negative");
    await assert.rejects(assertBranchSlotAvailable, /all 0 are in use|is set up for 0/);
  });

  dbIt("counts each company's seats separately", async () => {
    // The whole point of the filter: one customer filling up must not refuse another's staff.
    await db.company.update({ where: { id: companyId }, data: { userLimit: 1 } });
    const them = await db.company.create({ data: { name: "Other Co", slug: `quota-other-${Date.now()}`, userLimit: 3 } });

    await runForCompany(them.id, async () => {
      assert.deepEqual(await userQuota(), { used: 0, limit: 3, remaining: 3 }, "their count is theirs alone");
      await assertUserSeatAvailable();
    });

    await assert.rejects(assertUserSeatAvailable, /is set up for 1 user/, "and ours is still full");
  });
});
