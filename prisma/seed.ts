import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "@node-rs/argon2";
import { PrismaClient } from "../lib/generated/prisma/client";
import type { PermissionModule } from "../lib/generated/prisma/enums";

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

type Grant = [PermissionModule, { view: boolean; create: boolean; edit: boolean; delete: boolean }];
const ALL = { view: true, create: true, edit: true, delete: true };
const VIEW = { view: true, create: false, edit: false, delete: false };
const WORK = { view: true, create: true, edit: true, delete: false };
const MODULES: PermissionModule[] = ["CUSTOMERS", "SALES", "PROCUREMENT", "PROJECTS", "FINANCE", "USERS", "SETTINGS"];

// Preset roles. Admins can adjust these later from Users & Roles.
const PRESET_ROLES: { name: string; description: string; grants: Grant[] }[] = [
  {
    name: "Admin",
    description: "Full access to every module.",
    grants: MODULES.map((m) => [m, ALL]),
  },
  {
    name: "Sales User",
    description: "Manages customers, quotations and invoices.",
    grants: [
      ["CUSTOMERS", WORK],
      ["SALES", WORK],
      ["PROJECTS", VIEW],
    ],
  },
  {
    name: "Finance User",
    description: "Records income, expenses and payments.",
    grants: [
      ["FINANCE", ALL],
      ["CUSTOMERS", VIEW],
      ["SALES", VIEW],
      ["PROCUREMENT", VIEW],
      ["PROJECTS", VIEW],
    ],
  },
  {
    name: "Procurement User",
    description: "Manages suppliers, supplier quotations and purchases.",
    grants: [
      ["PROCUREMENT", WORK],
      ["CUSTOMERS", VIEW],
      ["PROJECTS", VIEW],
    ],
  },
  {
    name: "Project User",
    description: "Manages projects and views related sales and purchases.",
    grants: [
      ["PROJECTS", WORK],
      ["CUSTOMERS", VIEW],
      ["SALES", VIEW],
      ["PROCUREMENT", VIEW],
    ],
  },
];

async function seedRoles() {
  for (const role of PRESET_ROLES) {
    const saved = await db.role.upsert({
      where: { name: role.name },
      update: { description: role.description, isSystem: true },
      create: { name: role.name, description: role.description, isSystem: true },
    });
    for (const [module, p] of role.grants) {
      await db.rolePermission.upsert({
        where: { roleId_module: { roleId: saved.id, module } },
        update: {},
        create: { roleId: saved.id, module, canView: p.view, canCreate: p.create, canEdit: p.edit, canDelete: p.delete },
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

async function main() {
  await seedRoles();
  await seedSuperAdmin();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
