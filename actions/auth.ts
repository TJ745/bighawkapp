"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/auth";
import { BusinessError } from "@/lib/auth/errors";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getAppSettings } from "@/lib/data/settings";
import { loginSchema } from "@/lib/validation/auth";

const INVALID_CREDENTIALS = "Invalid email or password.";

/**
 * Email + password sign-in with account lockout (Settings → Security).
 * Runs server-side so failed attempts can be counted before BetterAuth issues a session.
 */
export async function signInWithPassword(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { email, password } = parseInput(loginSchema, input);
    const settings = await getAppSettings();
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, failedLoginAttempts: true, lockedUntil: true },
    });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
      throw new BusinessError(`Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`);
    }

    try {
      await auth.api.signInEmail({ body: { email, password }, headers: await headers() });
    } catch (error) {
      if (error instanceof APIError) {
        // 403 = correct password but the account is inactive (message comes from our session hook).
        if (error.statusCode === 403 && error.message) throw new BusinessError(error.message);
        if (user) await recordFailedAttempt(user, settings.maxLoginAttempts, settings.lockoutMinutes);
        throw new BusinessError(INVALID_CREDENTIALS);
      }
      throw error;
    }

    if (user && (user.failedLoginAttempts > 0 || user.lockedUntil)) {
      await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
    }
  });
}

async function recordFailedAttempt(
  user: { id: string; failedLoginAttempts: number },
  maxAttempts: number,
  lockoutMinutes: number,
) {
  const attempts = user.failedLoginAttempts + 1;
  const lock = attempts >= maxAttempts;
  await db.user.update({
    where: { id: user.id },
    data: {
      failedLoginAttempts: lock ? 0 : attempts,
      lockedUntil: lock ? new Date(Date.now() + lockoutMinutes * 60 * 1000) : null,
    },
  });
}
