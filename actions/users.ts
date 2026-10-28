"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/auth";
import { BusinessError } from "@/lib/auth/errors";
import { authorize } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { deleteStoredFile, fileFromFormData, IMAGE_TYPES, MAX_IMAGE_BYTES, storeFile } from "@/lib/storage";
import { getPasswordPolicy } from "@/lib/data/settings";
import { isEmailConfigured, renderEmailTemplate, sendEmail } from "@/lib/email/mailer";
import { notify } from "@/lib/notifications/notify";
import { recordAudit } from "@/lib/platform/audit";
import { assertUserSeatAvailable } from "@/lib/platform/quotas";
import { currentCompanyUsers } from "@/lib/platform/user-scope";
import { createUserSchema, updateUserSchema } from "@/lib/validation/users";

const AVATAR_FOLDER = "avatars";

function keyFromUrl(url: string | null) {
  return url?.startsWith("/api/files/") ? url.slice("/api/files/".length) : null;
}

/**
 * Deliberately **unscoped**, unlike every other user query here. An email address is how somebody
 * signs in, so it identifies one account across the whole platform: two companies can never share
 * one, and a clash has to be found wherever it lives — including in a customer we would otherwise
 * not be allowed to see.
 */
async function assertEmailAvailable(email: string, exceptUserId?: string) {
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptUserId) {
    throw new BusinessError("A user with this email already exists.");
  }
}

/** A user may only be pinned to a branch that exists and is open. */
async function assertBranchExists(branchId: string | null) {
  if (!branchId) return;
  const branch = await db.branch.findUnique({ where: { id: branchId }, select: { id: true, isActive: true, name: true } });
  if (!branch) throw new BusinessError("That branch no longer exists.");
  if (!branch.isActive) throw new BusinessError(`${branch.name} is not in use, so nobody can be assigned to it.`);
}

async function assertRoleExists(roleId: string) {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw new BusinessError("The selected role no longer exists.");
}

export async function createUser(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("USERS", "create");
    const input = parseInput(createUserSchema(await getPasswordPolicy()), formDataToObject(formData));
    await assertUserSeatAvailable();
    await assertEmailAvailable(input.email);
    await assertRoleExists(input.roleId);
    await assertBranchExists(input.branchId);

    const photo = fileFromFormData(formData, "photo");
    const stored = photo ? await storeFile(photo, AVATAR_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;
    const passwordHash = await hashPassword(input.password);
    const companyStamp = await currentCompanyUsers();

    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: input.roleId,
          branchId: input.branchId,
          isActive: input.isActive,
          image: stored?.url ?? null,
          emailVerified: true,
          // Stamped by hand: the tenant filter does not touch `User`, and without this the new
          // account belongs to no company — invisible to their own colleagues' Users list.
          ...companyStamp,
        },
      });
      await tx.account.create({
        data: { userId: created.id, accountId: created.id, providerId: "credential", password: passwordHash },
      });
      return created;
    });

    const roleName = (await db.role.findUnique({ where: { id: input.roleId }, select: { name: true } }))?.name ?? "";
    await notify({
      type: "NEW_USER_CREATED",
      title: `New user: ${user.name}`,
      message: `${auth.user.name} created an account for ${user.name} (${user.email})${roleName ? ` with the ${roleName} role` : ""}.`,
      link: `/users/${user.id}`,
    });
    // Welcome email to the new user (best effort; the password is shared separately by the admin).
    if (await isEmailConfigured()) {
      try {
        const rendered = await renderEmailTemplate("NEW_USER", { recipient_name: user.name });
        await sendEmail({ to: user.email, subject: rendered.subject, text: rendered.text });
      } catch (error) {
        console.error("[users] welcome email failed", error);
      }
    }

    await recordAudit({
      auth,
      action: "user.created",
      entity: "User",
      entityId: user.id,
      summary: `User ${user.name} (${user.email}) created${roleName ? ` as ${roleName}` : ""}`,
    });
    revalidatePath("/users");
    return { id: user.id };
  });
}

export async function updateUser(userId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("USERS", "edit");
    const target = await db.user.findFirst({ where: { id: userId, ...(await currentCompanyUsers()) } });
    if (!target) throw new BusinessError("User not found.");
    if (target.isSuperAdmin && !auth.user.isSuperAdmin) {
      throw new BusinessError("Only the Super Admin can edit the Super Admin account.");
    }

    const raw = formDataToObject(formData);
    // The Super Admin has no role and is always active; ignore those fields for that account.
    if (target.isSuperAdmin) {
      raw.roleId = target.roleId ?? "super-admin";
      raw.isActive = "true";
    }
    const input = parseInput(updateUserSchema(await getPasswordPolicy()), raw);
    await assertEmailAvailable(input.email, userId);
    if (!target.isSuperAdmin) await assertRoleExists(input.roleId);
    await assertBranchExists(input.branchId);
    if (!input.isActive && userId === auth.user.id) {
      throw new BusinessError("You cannot deactivate your own account.");
    }
    // Bringing somebody back takes a seat, so it goes through the same check creating one does.
    // Without this the limit is one deactivate-and-reactivate away from meaning nothing.
    if (input.isActive && !target.isActive) await assertUserSeatAvailable();

    const photo = fileFromFormData(formData, "photo");
    const removePhoto = raw.removePhoto === "true";
    const stored = photo ? await storeFile(photo, AVATAR_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;
    const passwordHash = input.password ? await hashPassword(input.password) : null;

    const companyStamp = await currentCompanyUsers();

    await db.$transaction(async (tx) => {
      // `updateMany`, so the company travels with the write and not only with the lookup above.
      // A unique `where: { id }` has no room for it, and a write is the half that does damage.
      await tx.user.updateMany({
        where: { id: userId, ...companyStamp },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: target.isSuperAdmin ? null : input.roleId,
          branchId: input.branchId,
          isActive: input.isActive,
          ...(stored ? { image: stored.url } : removePhoto ? { image: null } : {}),
        },
      });
      if (passwordHash) {
        await tx.account.updateMany({
          where: { userId, providerId: "credential" },
          data: { password: passwordHash },
        });
      }
      // Deactivating or changing the password signs the user out everywhere.
      if (!input.isActive || passwordHash) {
        await tx.session.deleteMany({ where: { userId } });
      }
    });

    if ((stored || removePhoto) && target.image) {
      const oldKey = keyFromUrl(target.image);
      if (oldKey) await deleteStoredFile(oldKey);
    }

    await recordAudit({
      auth,
      action: "user.updated",
      entity: "User",
      entityId: userId,
      summary: `User ${input.name} (${input.email}) updated${passwordHash ? ", password changed" : ""}`,
    });
    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
  });
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("USERS", "edit");
    const target = await db.user.findFirst({
      where: { id: userId, ...(await currentCompanyUsers()) },
      select: { isSuperAdmin: true, isActive: true, name: true },
    });
    if (!target) throw new BusinessError("User not found.");
    if (target.isSuperAdmin) throw new BusinessError("The Super Admin account cannot be deactivated.");
    if (!isActive && userId === auth.user.id) throw new BusinessError("You cannot deactivate your own account.");
    if (isActive && !target.isActive) await assertUserSeatAvailable();

    const companyStamp = await currentCompanyUsers();
    await db.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { id: userId, ...companyStamp }, data: { isActive } });
      if (!isActive) await tx.session.deleteMany({ where: { userId } });
    });

    await recordAudit({
      auth,
      action: isActive ? "user.reactivated" : "user.deactivated",
      entity: "User",
      entityId: userId,
      summary: `User ${target.name} ${isActive ? "reactivated" : "deactivated"}`,
    });
    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
  });
}
