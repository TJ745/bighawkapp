import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import type { AppModule, PosBusinessType } from "@/lib/generated/prisma/enums";
import { ALL_MODULES } from "@/lib/platform/modules";
import { getCompanySettings } from "@/lib/data/settings";

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

export async function listActiveBranches() {
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
  const chosen = (await cookies()).get(BRANCH_COOKIE)?.value;
  if (chosen) {
    const branch = (await listBranches()).find((b) => b.id === chosen && b.isActive);
    if (branch) return branch;
  }
  return getDefaultBranch();
});

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
