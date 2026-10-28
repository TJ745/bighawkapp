"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { recordAudit } from "@/lib/platform/audit";
import { roleSchema, type PermissionRowInput } from "@/lib/validation/users";

function toPermissionRows(permissions: PermissionRowInput[]) {
  // A row is only stored when at least one action is granted; "view" is implied by any other action.
  return permissions
    .filter((p) => p.view || p.create || p.edit || p.delete)
    .map((p) => ({
      module: p.module,
      canView: true,
      canCreate: p.create,
      canEdit: p.edit,
      canDelete: p.delete,
    }));
}

export async function createRole(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("USERS", "create");
    const data = parseInput(roleSchema, input);

    const role = await db.role.create({
      data: {
        name: data.name,
        description: data.description,
        permissions: { create: toPermissionRows(data.permissions) },
      },
    });

    await recordAudit({ auth, action: "role.created", entity: "Role", entityId: role.id, summary: `Role ${data.name} created` });
    revalidatePath("/users/roles");
    return { id: role.id };
  });
}

export async function updateRole(roleId: string, input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("USERS", "edit");
    const role = await db.role.findUnique({ where: { id: roleId }, select: { isSystem: true, name: true } });
    if (!role) throw new BusinessError("Role not found.");
    const data = parseInput(roleSchema, input);

    await db.$transaction(async (tx) => {
      await tx.role.update({
        where: { id: roleId },
        data: {
          // Preset role names are fixed so they stay recognisable.
          name: role.isSystem ? role.name : data.name,
          description: data.description,
        },
      });
      await tx.rolePermission.deleteMany({ where: { roleId } });
      const rows = toPermissionRows(data.permissions);
      if (rows.length) {
        await tx.rolePermission.createMany({ data: rows.map((r) => ({ ...r, roleId })) });
      }
    });

    await recordAudit({
      auth,
      action: "role.updated",
      entity: "Role",
      entityId: roleId,
      summary: `Role ${role.isSystem ? role.name : data.name} and its permissions updated`,
    });
    revalidatePath("/users/roles");
    revalidatePath(`/users/roles/${roleId}`);
  });
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("USERS", "delete");
    const role = await db.role.findUnique({
      where: { id: roleId },
      select: { isSystem: true, _count: { select: { users: true } } },
    });
    if (!role) throw new BusinessError("Role not found.");
    if (role.isSystem) throw new BusinessError("Preset roles cannot be deleted.");
    if (role._count.users > 0) {
      throw new BusinessError("This role is assigned to users. Move them to another role first.");
    }

    await db.role.delete({ where: { id: roleId } });
    await recordAudit({ auth, action: "role.deleted", entity: "Role", entityId: roleId, summary: `Role deleted` });
    revalidatePath("/users/roles");
  });
}
