import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../lib/generated/prisma/client";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

import { PRESET_ROLES } from "../lib/platform/preset-roles";


/**
 * The company every seeded row belongs to.
 *
 * One deployment still serves one customer today, so the seed keeps making exactly one. It is
 * created rather than assumed because the tenant columns are NOT NULL: nothing can be written
 * until a company exists to own it.
 */
async function seedCompany() {
  const name = (await db.companySettings.findFirst({}))?.companyName?.trim() || "My Company";
  const company = await db.company.upsert({
    where: { slug: "first-company" },
    update: {},
    create: { slug: "first-company", name },
  });
  console.log(`Company ready (${company.name}).`);
  return company.id;
}

async function seedRoles(companyId: string) {
  for (const role of PRESET_ROLES) {
    const saved = await db.role.upsert({
      where: { companyId_name: { companyId, name: role.name } },
      update: { description: role.description, isSystem: true },
      create: { companyId, name: role.name, description: role.description, isSystem: true },
    });
    for (const [module, p] of role.grants) {
      await db.rolePermission.upsert({
        where: { roleId_module: { roleId: saved.id, module } },
        update: {},
        create: { companyId, roleId: saved.id, module, canView: p.view, canCreate: p.create, canEdit: p.edit, canDelete: p.delete },
      });
    }
  }
  console.log(`Roles ready (${PRESET_ROLES.length}).`);
}

async function seedSuperAdmin() {
  const existing = await db.user.findFirst({ where: { isSuperAdmin: true } });
  if (existing) {
    console.log(`Super Admin already exists (${existing.email}).`);
    return;
  }
  const name = process.env.SUPER_ADMIN_NAME ?? "Super Admin";
  const email = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error("SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set to create the Super Admin.");
  }
  if (password.length < 8) {
    throw new Error("SUPER_ADMIN_PASSWORD must be at least 8 characters.");
  }

  // Same Argon2 parameters as lib/auth/auth.ts so BetterAuth can verify the hash.
  const passwordHash = await hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, email: email.toLowerCase(), emailVerified: true, isSuperAdmin: true, isActive: true },
    });
    // BetterAuth stores email/password credentials as an Account with providerId "credential"
    // whose accountId equals the user id.
    await tx.account.create({
      data: { userId: created.id, accountId: created.id, providerId: "credential", password: passwordHash },
    });
    return created;
  });
  console.log(`Super Admin created: ${user.email}`);
}

/**
 * Module rows and the first branch. Business Management is on so an existing company keeps
 * working; POS is off until the BigHawk Super Admin enables it in Settings → Modules.
 */
async function seedPlatform(companyId: string) {
  for (const [module, enabled] of [
    ["BUSINESS_MANAGEMENT", true],
    ["POS", false],
  ] as const) {
    await db.moduleSetting.upsert({
      where: { companyId_module: { companyId, module } },
      update: {},
      create: { companyId, module, enabled, enabledAt: enabled ? new Date() : null },
    });
  }

  if ((await db.branch.count({ where: { companyId } })) === 0) {
    const company = await db.companySettings.findFirst({});
    await db.branch.create({
      data: {
        companyId,
        code: "MAIN",
        name: company?.companyName?.trim() || "Main Branch",
        phone: company?.phone ?? null,
        address: company?.address ?? null,
        vatNumber: company?.vatNumber ?? null,
        isDefault: true,
      },
    });
    console.log("Default branch created (MAIN).");
  }
  /**
   * Report what is actually switched on, not what a fresh install would have. The old line said
   * "Business Management on, POS off" unconditionally, which reads like the seed had just turned
   * POS off — it never does, because the upsert above leaves an existing row alone.
   */
  const modules = await db.moduleSetting.findMany({ where: { companyId }, select: { module: true, enabled: true }, orderBy: { module: "asc" } });
  console.log(`Modules ready (${modules.map((m) => `${m.module} ${m.enabled ? "on" : "off"}`).join(", ")}; existing settings left as they were).`);
}

async function main() {
  const companyId = await seedCompany();
  await seedRoles(companyId);
  await seedPlatform(companyId);
  await seedSuperAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
