import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { Prisma } from "@/lib/generated/prisma/client";
import type { AppModule, PosBusinessType } from "@/lib/generated/prisma/enums";
import { ALL_MODULES } from "@/lib/platform/modules";
import { getCompanySettings } from "@/lib/data/settings";
import { allowedBranchIds } from "@/lib/auth/current-user";

/**
 * Reads for the platform layer: which modules are on, the company's branches and their POS
 * configuration. Single source of truth — when BigHawk becomes multi-tenant, the tenant filter
 * goes in here and callers keep working.
 */

export const BRANCH_COOKIE = "bighawk_branch";
const DEFAULT_BRANCH_CODE = "MAIN";

/** Business Management is on for existing installs; POS is opt-in, enabled by the Super Admin. */
const DEFAULT_ENABLED: Record<AppModule, boolean> = { BUSINESS_MANAGEMENT: true, POS: false };

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Module rows, created with their defaults on first access. Cached per request: the sidebar,
 * header, pages and actions all consult it, and none of them should cost another query.
 */
export const getModuleSettings = cache(async (): Promise<Record<AppModule, boolean>> => {
  const rows = await db.moduleSetting.findMany();
  const missing = ALL_MODULES.filter((m) => !rows.some((r) => r.module === m));
  if (missing.length > 0) {
    try {
      await db.moduleSetting.createMany({
        data: missing.map((module) => ({
          module,
          enabled: DEFAULT_ENABLED[module],
          enabledAt: DEFAULT_ENABLED[module] ? new Date() : null,
        })),
      });
    } catch (error) {
      // Two first requests can race; the loser just reads what the winner wrote.
      if (!isUniqueViolation(error)) throw error;
    }
    const all = await db.moduleSetting.findMany();
    return Object.fromEntries(all.map((r) => [r.module, r.enabled])) as Record<AppModule, boolean>;
  }
  return Object.fromEntries(rows.map((r) => [r.module, r.enabled])) as Record<AppModule, boolean>;
});

export async function getEnabledModules(): Promise<AppModule[]> {
  const settings = await getModuleSettings();
  return ALL_MODULES.filter((m) => settings[m]);
}

export async function isModuleEnabled(module: AppModule) {
  return (await getModuleSettings())[module] === true;
}

/**
 * Branches, creating the first one from the company name so existing installs always have a
 * branch to attach POS configuration (and later registers, shifts and sales) to.
 */
export const listBranches = cache(async () => {
  const existing = await db.branch.findMany({ include: { posConfig: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  if (existing.length > 0) return existing;

  const company = await getCompanySettings();
  try {
    await db.branch.create({
      data: {
        code: DEFAULT_BRANCH_CODE,
        name: company.companyName.trim() || "Main Branch",
        phone: company.phone,
        city: null,
        address: company.address,
        vatNumber: company.vatNumber,
        isDefault: true,
      },
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return db.branch.findMany({ include: { posConfig: true }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
});

export type BranchRow = Awaited<ReturnType<typeof listBranches>>[number];

/**
 * The active branches the signed-in user may work in.
 *
 * Every branch picker in the app reads this — the header switcher, the stock screen, the receive
 * dialog — so pinning someone to a branch narrows all of them from one place. Settings → Branches
 * and Settings → Modules deliberately keep using `listBranches()`: administering branches is not
 * the same as working in one.
 */
export async function listActiveBranches() {
  const active = (await listBranches()).filter((b) => b.isActive);
  const allowed = await allowedBranchIds();
  return allowed === null ? active : active.filter((b) => allowed.includes(b.id));
}

/**
 * Every active branch, whoever is asking — for choosing where stock is being **sent**.
 *
 * Working at a branch and sending stock to one are different things: a storekeeper pinned to the
 * warehouse must still be able to send goods to a shop they never set foot in. Scoping this list
 * the way `listActiveBranches()` is scoped would quietly make transfers impossible for exactly the
 * people who make them.
 */
export async function listTransferDestinations() {
  return (await listBranches()).filter((b) => b.isActive);
}

export async function getBranch(id: string) {
  return (await listBranches()).find((b) => b.id === id) ?? null;
}

export async function getDefaultBranch(): Promise<BranchRow> {
  const branches = await listBranches();
  return branches.find((b) => b.isDefault && b.isActive) ?? branches.find((b) => b.isActive) ?? branches[0];
}

/**
 * The branch the current user is working in: their chosen one from the cookie when it is still
 * active, otherwise the default. POS registers, shifts and sales will all be stamped with this.
 */
export const getCurrentBranch = cache(async (): Promise<BranchRow> => {
  const branches = await listBranches();
  const allowed = await allowedBranchIds();
  const mayUse = (branch: BranchRow) => branch.isActive && (allowed === null || allowed.includes(branch.id));

  /**
   * The cookie is a request, not permission. A user pinned to one branch who carries another
   * branch's cookie — set before they were pinned, or by hand — is given their own branch, not
   * the one they asked for.
   */
  const chosen = (await cookies()).get(BRANCH_COOKIE)?.value;
  if (chosen) {
    const branch = branches.find((b) => b.id === chosen && mayUse(b));
    if (branch) return branch;
  }

  // A pinned user falls back to their own branch rather than the company default.
  if (allowed !== null) {
    const own = branches.find((b) => allowed.includes(b.id) && b.isActive);
    if (own) return own;
  }
  return getDefaultBranch();
});

/**
 * Refuses a branch the signed-in user may not work in.
 *
 * For actions that take a branch **from the client** — a stock count, a transfer, a goods receipt.
 * Narrowing the picker is not the check: the id arrives in a request that anyone can shape.
 */
export async function assertBranchAllowed(branchId: string): Promise<BranchRow> {
  const branch = await getBranch(branchId);
  if (!branch) throw new BusinessError("That branch no longer exists.");
  const allowed = await allowedBranchIds();
  if (allowed !== null && !allowed.includes(branch.id)) {
    throw new BusinessError(`You do not work at ${branch.name}, so you cannot record anything against it.`);
  }
  if (!branch.isActive) throw new BusinessError(`${branch.name} is not in use.`);
  return branch;
}

/** POS configuration for a branch, created with defaults the first time it is needed. */
export async function getPosConfiguration(branchId: string) {
  const existing = await db.posConfiguration.findUnique({ where: { branchId } });
  if (existing) return existing;
  try {
    return await db.posConfiguration.create({ data: { branchId } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return (await db.posConfiguration.findUnique({ where: { branchId } }))!;
  }
}

export type PosConfigurationRow = Awaited<ReturnType<typeof getPosConfiguration>>;

/** The POS business type in force for a branch, with the default for a branch not set up yet. */
export async function getBranchPosType(branchId: string): Promise<PosBusinessType> {
  const branch = await getBranch(branchId);
  return branch?.posConfig?.businessType ?? "RETAIL";
}
