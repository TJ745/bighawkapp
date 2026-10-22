"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize, authorizeSignedIn, authorizeSuperAdmin } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { BRANCH_COOKIE, getPosConfiguration, listBranches } from "@/lib/data/platform";
import { recordAudit } from "@/lib/platform/audit";
import { moduleLabel } from "@/lib/platform/modules";
import { posTypeLabel } from "@/lib/platform/pos-types";
import { branchSchema, moduleToggleSchema, posConfigurationSchema } from "@/lib/validation/platform";

function revalidateAll() {
  // Modules and branches change the navigation, so the whole shell has to re-render.
  revalidatePath("/", "layout");
}

// --- Modules (BigHawk Super Admin) -------------------------------------------

/** Switches a product module on or off for this company. */
export async function setModuleEnabled(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const { module, enabled } = parseInput(moduleToggleSchema, input);

    await db.moduleSetting.upsert({
      where: { module },
      update: { enabled, enabledAt: enabled ? new Date() : null },
      create: { module, enabled, enabledAt: enabled ? new Date() : null },
    });

    await recordAudit({
      auth,
      action: enabled ? "module.enabled" : "module.disabled",
      entity: "Module",
      entityId: module,
      summary: `${moduleLabel(module)} ${enabled ? "enabled" : "disabled"}`,
    });
    revalidateAll();
  });
}

/** Sets the POS industry and receipt text for one branch. */
export async function savePosConfiguration(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorizeSuperAdmin();
    const data = parseInput(posConfigurationSchema, input);

    const branch = await db.branch.findUnique({ where: { id: data.branchId }, select: { id: true, name: true } });
    if (!branch) throw new BusinessError("Branch not found.");

    await db.posConfiguration.upsert({
      where: { branchId: data.branchId },
      update: {
        businessType: data.businessType,
        isActive: data.isActive,
        receiptHeader: data.receiptHeader,
        receiptFooter: data.receiptFooter,
      },
      create: { ...data },
    });

    await recordAudit({
      auth,
      action: "pos.configured",
      entity: "PosConfiguration",
      entityId: data.branchId,
      branchId: data.branchId,
      summary: `${branch.name} POS set to ${posTypeLabel(data.businessType)}${data.isActive ? "" : " (inactive)"}`,
      metadata: { businessType: data.businessType, isActive: data.isActive },
    });
    revalidateAll();
  });
}

// --- Branches (Settings permission) ------------------------------------------

async function assertCodeAvailable(code: string, exceptId?: string) {
  const existing = await db.branch.findUnique({ where: { code }, select: { id: true } });
  if (existing && existing.id !== exceptId) throw new BusinessError("A branch with this code already exists.");
}

export async function createBranch(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "create");
    const data = parseInput(branchSchema, formDataToObject(formData));
    await assertCodeAvailable(data.code);

    const isFirst = (await db.branch.count()) === 0;
    const branch = await db.branch.create({ data: { ...data, isDefault: isFirst } });

    await recordAudit({ auth, action: "branch.created", entity: "Branch", entityId: branch.id, branchId: branch.id, summary: `Branch ${branch.name} created` });
    revalidateAll();
    return { id: branch.id };
  });
}

export async function updateBranch(branchId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const data = parseInput(branchSchema, formDataToObject(formData));
    const current = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, isDefault: true, name: true } });
    if (!current) throw new BusinessError("Branch not found.");
    await assertCodeAvailable(data.code, branchId);
    // The default branch is where unassigned work lands, so it has to stay usable.
    if (current.isDefault && !data.isActive) throw new BusinessError("The default branch cannot be deactivated. Make another branch the default first.");

    await db.branch.update({ where: { id: branchId }, data });

    await recordAudit({ auth, action: "branch.updated", entity: "Branch", entityId: branchId, branchId, summary: `Branch ${data.name} updated` });
    revalidateAll();
  });
}

/** Moves the default flag, which decides where users land when they have not chosen a branch. */
export async function setDefaultBranch(branchId: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("SETTINGS", "edit");
    const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true, isActive: true } });
    if (!branch) throw new BusinessError("Branch not found.");
    if (!branch.isActive) throw new BusinessError("Activate the branch before making it the default.");

    await db.$transaction([
      db.branch.updateMany({ where: { isDefault: true }, data: { isDefault: false } }),
      db.branch.update({ where: { id: branchId }, data: { isDefault: true } }),
    ]);

    await recordAudit({ auth, action: "branch.default_changed", entity: "Branch", entityId: branchId, branchId, summary: `${branch.name} is now the default branch` });
    revalidateAll();
  });
}

/** Ensures a branch has a POS configuration row, so the Modules screen can show its industry. */
export async function ensurePosConfiguration(branchId: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSuperAdmin();
    await getPosConfiguration(branchId);
    revalidatePath("/settings/modules");
  });
}

// --- Branch in use -----------------------------------------------------------

/** Remembers which branch this user is working in. Any signed-in user may switch. */
export async function switchBranch(branchId: string): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSignedIn();
    const branch = (await listBranches()).find((b) => b.id === branchId && b.isActive);
    if (!branch) throw new BusinessError("That branch is not available.");

    (await cookies()).set(BRANCH_COOKIE, branchId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    revalidateAll();
  });
}
