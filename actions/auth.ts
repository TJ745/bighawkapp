"use server";

import { headers } from "next/headers";
import { APIError } from "better-auth/api";
import { db } from "@/lib/db";
import { runForCompany } from "@/lib/db/tenant";
import { auth, PASSWORD_RESET_THROTTLE_SECONDS } from "@/lib/auth/auth";
import { BusinessError } from "@/lib/auth/errors";
import { parseInput, runAction, type ActionResult } from "@/lib/actions";
import { getAppSettings, getPasswordPolicy } from "@/lib/data/settings";
import { isEmailConfigured } from "@/lib/email/mailer";
import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/lib/validation/auth";

const INVALID_CREDENTIALS = "Invalid email or password.";

/**
 * Email + password sign-in with account lockout (Settings → Security).
 * Runs server-side so failed attempts can be counted before BetterAuth issues a session.
 */
export async function signInWithPassword(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const { email, password } = parseInput(loginSchema, input);
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, failedLoginAttempts: true, lockedUntil: true, companyId: true },
    });
    /**
     * The lockout policy belongs to the company this account works for — not to whichever
     * company the deployment answers with for a visitor it cannot yet identify. The address
     * already names the account, so the right settings are knowable before the password is.
     */
    const settings = user?.companyId ? await runForCompany(user.companyId, getAppSettings) : await getAppSettings();

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

/**
 * The one answer this action ever gives.
 *
 * Whether the address belongs to an account, to a deactivated account, or to nobody at all, the
 * reply is identical — otherwise the sign-in screen becomes a way of asking the app who has an
 * account here. BetterAuth takes the same care internally, even simulating the work for an unknown
 * address so the timing does not give it away.
 */
const RESET_REQUESTED = "If that email address has an account, a reset link is on its way.";

/**
 * Asking for a password reset link.
 *
 * Nothing here is behind a permission: it runs from the sign-in screen, for someone who by
 * definition cannot sign in. What keeps it safe is that it reveals nothing and does very little —
 * one email, at most once a minute per account, carrying a random token that lasts an hour.
 */
export async function requestPasswordReset(input: unknown): Promise<ActionResult<{ message: string }>> {
  return runAction(async () => {
    const { email } = parseInput(forgotPasswordSchema, input);

    /**
     * Without SMTP there is no way to deliver a link, and saying "check your email" would strand
     * the user. This is a configuration fault rather than anything about the account, so it is the
     * one case where the reply differs — and it says nothing about who has an account.
     */
    if (!(await isEmailConfigured())) {
      throw new BusinessError("Password reset is unavailable because email has not been set up. Please contact your administrator.");
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, isActive: true, passwordResetRequestedAt: true, companyId: true },
    });

    // An unknown or deactivated account gets the same answer, and no email.
    if (!user?.isActive) return { message: RESET_REQUESTED };

    // Asked again too soon: answer as usual and send nothing.
    const since = user.passwordResetRequestedAt ? Date.now() - user.passwordResetRequestedAt.getTime() : Infinity;
    if (since < PASSWORD_RESET_THROTTLE_SECONDS * 1000) return { message: RESET_REQUESTED };

    // Stamped before sending, so a slow mail server cannot be used to get several links at once.
    await db.user.update({ where: { id: user.id }, data: { passwordResetRequestedAt: new Date() } });
    /**
     * No `redirectTo`: the link in the email is built from the token by `sendResetPassword`, so
     * BetterAuth's own redirect hop is not used and there is no callback URL to validate.
     */
    const headerList = await headers();
    /**
     * Sending runs as the account's own company: `sendResetPassword` reads that company's email
     * template and SMTP settings, and a link worded by another customer's template would be
     * wrong even when it works.
     */
    const send = () => auth.api.requestPasswordReset({ body: { email }, headers: headerList });
    await (user.companyId ? runForCompany(user.companyId, send) : send());

    return { message: RESET_REQUESTED };
  });
}

/**
 * Setting the new password from a reset link.
 *
 * The password is checked against Settings → Security here, because BetterAuth only enforces a
 * length. Everything else — spending the token, hashing with Argon2, signing other sessions out,
 * clearing the lockout — is handled by the auth layer in `lib/auth/auth.ts`.
 */
export async function completePasswordReset(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const policy = await getPasswordPolicy();
    const { token, password } = parseInput(resetPasswordSchema(policy), input);

    try {
      await auth.api.resetPassword({ body: { newPassword: password, token }, headers: await headers() });
    } catch (error) {
      if (error instanceof APIError) {
        // A spent, expired or invented token all arrive here, and all mean the same thing to a user.
        throw new BusinessError("This reset link is no longer valid. Please ask for a new one.");
      }
      throw error;
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
