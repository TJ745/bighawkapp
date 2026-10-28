"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { authorizeSuperAdmin } from "@/lib/auth/session";
import { BusinessError } from "@/lib/auth/errors";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { db } from "@/lib/db";
import { runAsPlatform, runForCompany } from "@/lib/db/tenant";
import { OPERATOR_COMPANY_COOKIE } from "@/lib/db/tenant-scope";
import { recordAudit } from "@/lib/platform/audit";
import { companySchema, newCompanySchema, switchCompanySchema } from "@/lib/validation/companies";

/**
 * Onboarding and switching between customers.
 *
 * Each audit entry here is written **inside the company it is about**, not inside whichever one
 * the operator happened to be working in. Otherwise "Company B created" lands in company A's
 * activity log, where it means nothing to them and is missing from the only log where it
 * belongs.
 *
 * Super Admin only, and the only actions in the app that act across companies on purpose. A new
 * customer is not just a row: it needs the roles, module rows and first branch that every other
 * company got from the seed, or its first administrator signs in to a shell they cannot use.
 */

function revalidateCompanies() {
  revalidatePath("/settings/companies");
  // Switching changes what every screen shows, so nothing cached may survive it.
  revalidatePath("/", "layout");
}

export async function createCompany(input: unknown): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const data = parseInput(newCompanySchema, input);

    const clash = await runAsPlatform("checking a new customer's handle is free", () =>
      db.company.findFirst({ where: { slug: data.slug }, select: { id: true } }),
    );
    if (clash) throw new BusinessError(`Another company already uses the handle "${data.slug}".`);

    /**
     * An email address is how somebody signs in, so it names one account across the whole
     * platform: two customers can never share one. Checked **before** the company row is written,
     * because failing afterwards would leave a shell nobody can sign in to.
     */
    const takenEmail = await runAsPlatform("checking the administrator's email is free", () =>
      db.user.findUnique({ where: { email: data.adminEmail }, select: { id: true } }),
    );
    if (takenEmail) throw new BusinessError(`${data.adminEmail} already signs in to BigHawk, and an address can only belong to one account.`);

    const company = await runAsPlatform("creating a customer", () =>
      db.company.create({ data: { name: data.name, slug: data.slug, userLimit: data.userLimit, branchLimit: data.branchLimit } }),
    );

    /**
     * The same setup every other company got from the seed, inside the new company's own scope so
     * every row is stamped with it. Without this the first administrator signs in to a company
     * with no roles to grant, no modules and nowhere to sell from — and without the administrator
     * itself, nobody signs in at all.
     */
    await runForCompany(company.id, async () => {
      const { seedCompanyDefaults } = await import("@/lib/platform/new-company");
      await seedCompanyDefaults(company.name, { name: data.adminName, email: data.adminEmail, password: data.adminPassword });
    });

    await runForCompany(company.id, () =>
      recordAudit({
        auth,
        action: "platform.company_created",
      entity: "Company",
      entityId: company.id,
        summary: `Company ${company.name} (${company.slug}) created, with ${data.adminEmail} as its administrator`,
      }),
    );
    revalidateCompanies();
    return { id: company.id, name: company.name };
  });
}

export async function renameCompany(companyId: string, input: unknown): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const data = parseInput(companySchema, input);

    const clash = await runAsPlatform("checking a handle is free", () =>
      db.company.findFirst({ where: { slug: data.slug, id: { not: companyId } }, select: { id: true } }),
    );
    if (clash) throw new BusinessError(`Another company already uses the handle "${data.slug}".`);

    const company = await runAsPlatform("updating a customer", () =>
      db.company.update({
        where: { id: companyId },
        data: { name: data.name, slug: data.slug, userLimit: data.userLimit, branchLimit: data.branchLimit },
      }),
    );
    /**
     * A limit may be set below what the customer is already using. Nothing is switched off for
     * them: the quota checks simply refuse anything *new* until usage comes back under the line.
     * Deactivating somebody's staff on their behalf is not ours to do.
     */
    await runForCompany(companyId, () =>
      recordAudit({
        auth,
        action: "platform.company_updated",
        entity: "Company",
        entityId: companyId,
        summary: `Company ${company.name} updated — ${company.userLimit} users, ${company.branchLimit} branches`,
      }),
    );
    revalidateCompanies();
    return { name: company.name };
  });
}

/**
 * Switches a customer off, or back on.
 *
 * Never a delete. A company's rows cascade from it, so deleting one would take every invoice,
 * sale and stock movement with it — and "we are not using BigHawk any more" is not the same
 * sentence as "none of that ever happened". Switched off, its people cannot sign in and its
 * subdomain resolves to nothing, while the records stay.
 */
export async function setCompanyActive(companyId: string, isActive: boolean): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();

    if (!isActive) {
      const active = await runAsPlatform("counting the customers left", () => db.company.count({ where: { isActive: true } }));
      if (active <= 1) throw new BusinessError("This is the only company left, so switching it off would leave nothing to run.");
    }

    const company = await runAsPlatform("switching a customer on or off", () =>
      db.company.update({ where: { id: companyId }, data: { isActive }, select: { name: true } }),
    );

    // A company that is off must not stay in force for whoever switched it off.
    if (!isActive) (await cookies()).delete(OPERATOR_COMPANY_COOKIE);

    await runForCompany(companyId, () =>
      recordAudit({
        auth,
        action: isActive ? "platform.company_enabled" : "platform.company_disabled",
        entity: "Company",
        entityId: companyId,
        summary: `Company ${company.name} switched ${isActive ? "on" : "off"}`,
      }),
    );
    revalidateCompanies();
    return { name: company.name };
  });
}

/**
 * Chooses which customer the operator is working on.
 *
 * A cookie, read by `scopeFromRequest` — the same shape the branch switcher uses, and treated the
 * same way: a request, not permission. Only the operator has no company of their own, so only the
 * operator can be given one this way; for everybody else the account decides and this would be
 * ignored.
 */
export async function actAsCompany(input: unknown): Promise<ActionResult<{ name: string }>> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const { companyId } = parseInput(switchCompanySchema, input);

    const company = await runAsPlatform("the operator choosing a customer", () =>
      db.company.findFirst({ where: { id: companyId, isActive: true }, select: { id: true, name: true } }),
    );
    if (!company) throw new BusinessError("That company is not available.");

    (await cookies()).set(OPERATOR_COMPANY_COOKIE, company.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });
    await runForCompany(company.id, () =>
      recordAudit({
        auth,
        action: "platform.company_switched",
        entity: "Company",
        entityId: company.id,
        summary: `Operator acting as ${company.name}`,
      }),
    );
    revalidateCompanies();
    return { name: company.name };
  });
}

/** Stops acting as any particular customer. */
export async function stopActingAsCompany(): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();
    (await cookies()).delete(OPERATOR_COMPANY_COOKIE);
    revalidateCompanies();
  });
}
