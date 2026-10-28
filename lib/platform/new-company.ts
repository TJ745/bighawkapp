import "server-only";
import { db } from "@/lib/db";
import { requireCompanyId } from "@/lib/db/tenant";
import { hashPassword } from "@/lib/auth/auth";
import { PRESET_ROLES } from "./preset-roles";

/** The account the customer signs in with and runs their own company from. */
export type FirstAdmin = { name: string; email: string; password: string };

/**
 * Everything a new customer needs before anybody can use it.
 *
 * A `Company` row on its own is a shell: no roles to grant, no module subscriptions, nowhere to
 * sell from and nobody who can sign in. This is the same setup the seed gives the first company,
 * so a customer onboarded through the app and one created by the seed are indistinguishable
 * afterwards.
 *
 * Runs **inside the new company's scope** — the caller wraps it in `runForCompany` — so every row
 * is stamped with it by the tenant filter rather than by hand. `User` is the exception: it sits
 * outside the filter (see `user-scope.ts`), so its company is written here explicitly.
 */
export async function seedCompanyDefaults(companyName: string, admin: FirstAdmin) {
  const companyId = requireCompanyId();

  let adminRoleId: string | null = null;
  for (const role of PRESET_ROLES) {
    const saved = await db.role.create({
      data: {
        name: role.name,
        description: role.description,
        isSystem: true,
        permissions: {
          create: role.grants.map(([module, p]) => ({
            companyId,
            module,
            canView: p.view,
            canCreate: p.create,
            canEdit: p.edit,
            canDelete: p.delete,
          })),
        },
      },
      select: { id: true, name: true },
    });
    if (saved.name === "Admin") adminRoleId = saved.id;
  }
  if (!adminRoleId) throw new Error("The preset roles no longer include one called Admin, so the first administrator has nothing to be granted.");

  /**
   * Business Management on, POS off — the same starting point the seed uses. A customer who has
   * bought POS has it switched on from Settings → Modules, which is where that decision belongs.
   */
  for (const [module, enabled] of [
    ["BUSINESS_MANAGEMENT", true],
    ["POS", false],
  ] as const) {
    await db.moduleSetting.create({ data: { module, enabled, enabledAt: enabled ? new Date() : null } });
  }

  // Somewhere to work from. Branch codes are unique per company, so MAIN is free in a new one.
  await db.branch.create({ data: { code: "MAIN", name: companyName.trim() || "Main Branch", isDefault: true } });

  // The company's own name, so the first screen a customer sees is already theirs.
  await db.companySettings.create({ data: { companyName: companyName.trim() } });

  /**
   * The person who will run it.
   *
   * Created last, because it needs the Admin role to exist. `branchId: null` means every branch:
   * whoever runs the company is not pinned to one shop. The password is set by the operator and
   * passed to the customer, who changes it from their profile — there is no invitation email,
   * because a brand-new company has no mail server configured yet and an administrator who
   * cannot sign in has nowhere to configure one.
   *
   * Both rows together, so a company can never end up with an account that has no way to
   * authenticate: `User` is the identity, `Account` holds the credential BetterAuth checks.
   */
  const passwordHash = await hashPassword(admin.password);
  await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: admin.name.trim(),
        email: admin.email.trim().toLowerCase(),
        roleId: adminRoleId,
        branchId: null,
        isActive: true,
        emailVerified: true,
        companyId,
      },
    });
    await tx.account.create({
      data: { userId: created.id, accountId: created.id, providerId: "credential", password: passwordHash },
    });
  });
}
