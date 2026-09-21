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
import { createUserSchema, updateUserSchema } from "@/lib/validation/users";

const AVATAR_FOLDER = "avatars";

function keyFromUrl(url: string | null) {
  return url?.startsWith("/api/files/") ? url.slice("/api/files/".length) : null;
}

async function assertEmailAvailable(email: string, exceptUserId?: string) {
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing && existing.id !== exceptUserId) {
    throw new BusinessError("A user with this email already exists.");
  }
}

async function assertRoleExists(roleId: string) {
  const role = await db.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!role) throw new BusinessError("The selected role no longer exists.");
}

export async function createUser(formData: FormData): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const auth = await authorize("USERS", "create");
    const input = parseInput(createUserSchema(await getPasswordPolicy()), formDataToObject(formData));
    await assertEmailAvailable(input.email);
    await assertRoleExists(input.roleId);

    const photo = fileFromFormData(formData, "photo");
    const stored = photo ? await storeFile(photo, AVATAR_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;
    const passwordHash = await hashPassword(input.password);

    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: input.roleId,
          isActive: input.isActive,
          image: stored?.url ?? null,
          emailVerified: true,
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

    revalidatePath("/users");
    return { id: user.id };
  });
}

export async function updateUser(userId: string, formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("USERS", "edit");
    const target = await db.user.findUnique({ where: { id: userId } });
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
    if (!input.isActive && userId === auth.user.id) {
      throw new BusinessError("You cannot deactivate your own account.");
    }

    const photo = fileFromFormData(formData, "photo");
    const removePhoto = raw.removePhoto === "true";
    const stored = photo ? await storeFile(photo, AVATAR_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;
    const passwordHash = input.password ? await hashPassword(input.password) : null;

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          roleId: target.isSuperAdmin ? null : input.roleId,
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

    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
  });
}

export async function setUserActive(userId: string, isActive: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const auth = await authorize("USERS", "edit");
    const target = await db.user.findUnique({ where: { id: userId }, select: { isSuperAdmin: true } });
    if (!target) throw new BusinessError("User not found.");
    if (target.isSuperAdmin) throw new BusinessError("The Super Admin account cannot be deactivated.");
    if (!isActive && userId === auth.user.id) throw new BusinessError("You cannot deactivate your own account.");

    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive } });
      if (!isActive) await tx.session.deleteMany({ where: { userId } });
    });

    revalidatePath("/users");
    revalidatePath(`/users/${userId}`);
  });
}
