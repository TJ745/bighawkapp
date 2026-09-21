"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/auth";
import { BusinessError } from "@/lib/auth/errors";
import { authorizeSignedIn } from "@/lib/auth/session";
import { formDataToObject, parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getPasswordPolicy } from "@/lib/data/settings";
import { deleteStoredFile, fileFromFormData, IMAGE_TYPES, MAX_IMAGE_BYTES, storeFile } from "@/lib/storage";
import { changePasswordSchema, profileSchema } from "@/lib/validation/profile";

const AVATAR_FOLDER = "avatars";

function keyFromUrl(url: string | null) {
  return url?.startsWith("/api/files/") ? url.slice("/api/files/".length) : null;
}

/** Everyone may edit their own name, phone and photo — no USERS permission involved. */
export async function updateOwnProfile(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    const { user } = await authorizeSignedIn();
    const raw = formDataToObject(formData);
    const input = parseInput(profileSchema, raw);

    const photo = fileFromFormData(formData, "photo");
    const removePhoto = raw.removePhoto === "true";
    const stored = photo ? await storeFile(photo, AVATAR_FOLDER, { allowedTypes: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES }) : null;

    await db.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        phone: input.phone,
        ...(stored ? { image: stored.url } : removePhoto ? { image: null } : {}),
      },
    });

    if ((stored || removePhoto) && user.image) {
      const oldKey = keyFromUrl(user.image);
      if (oldKey) await deleteStoredFile(oldKey);
    }

    revalidatePath("/profile");
    revalidatePath("/users");
    revalidatePath(`/users/${user.id}`);
    // The header shows the name and photo.
    revalidatePath("/", "layout");
  });
}

/**
 * Password change for the signed-in user. BetterAuth verifies the current password with the same
 * Argon2 settings used at sign-in, and other devices are signed out.
 */
export async function changeOwnPassword(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    await authorizeSignedIn();
    const values = parseInput(changePasswordSchema(await getPasswordPolicy()), input);
    try {
      await auth.api.changePassword({
        body: { currentPassword: values.currentPassword, newPassword: values.newPassword, revokeOtherSessions: true },
        headers: await headers(),
      });
    } catch (error) {
      if (error instanceof APIError) throw new BusinessError("Your current password is not correct.");
      throw error;
    }
  });
}
