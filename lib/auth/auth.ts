import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/lib/db";
import { renderEmailTemplate, sendEmail } from "@/lib/email/mailer";

/**
 * How long a password reset link lasts.
 *
 * An hour is long enough to find the email and short enough that a link left in an inbox is not a
 * standing key to the account. It is deliberately not a setting: an administrator lengthening it
 * would be weakening the one credential that bypasses the password.
 */
export const PASSWORD_RESET_TOKEN_SECONDS = 60 * 60;

/** The same duration in words, for the email. */
export function describeResetExpiry() {
  const minutes = Math.round(PASSWORD_RESET_TOKEN_SECONDS / 60);
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `${minutes} minutes`;
}

/**
 * How long to wait before sending another reset link to the same account.
 *
 * Without this, the form is a button for filling someone's inbox. The caller stays silent when it
 * applies, so the throttle cannot be used to tell real addresses from made-up ones either.
 */
export const PASSWORD_RESET_THROTTLE_SECONDS = 60;

// Argon2id parameters (OWASP recommended baseline).
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(password: string) {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashed: string, password: string) {
  return verify(hashed, password, ARGON2_OPTIONS);
}

// Sessions expire after the inactivity timeout from Settings → Security. The timeout is applied
// whenever a session is created or refreshed (refresh happens at most every SESSION_REFRESH_SECONDS).
const SESSION_REFRESH_SECONDS = 5 * 60;
const SESSION_MAX_SECONDS = 60 * 60 * 24 * 30;

async function sessionExpiry() {
  const settings = await db.appSettings.findFirst({ select: { sessionTimeoutMinutes: true } });
  const minutes = settings?.sessionTimeoutMinutes ?? 720;
  return new Date(Date.now() + minutes * 60 * 1000);
}

export const auth = betterAuth({
  appName: "BigHawk",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by administrators from Users & Roles, never self-registered.
    disableSignUp: true,
    resetPasswordTokenExpiresIn: PASSWORD_RESET_TOKEN_SECONDS,
    /**
     * Resetting a password signs out everywhere else. Someone resetting because their account was
     * taken over would otherwise leave the intruder's session alive, which defeats the point.
     */
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      /**
       * A deactivated account gets no reset link: the password would be changeable while sign-in
       * stays blocked by the session hook. Checked against the database rather than the user object
       * handed in, so this holds whatever BetterAuth chooses to pass along.
       */
      const current = await db.user.findUnique({ where: { id: user.id }, select: { isActive: true, name: true } });
      if (!current?.isActive) return;

      const base = process.env.BETTER_AUTH_URL ?? "";
      const resetUrl = `${base}/reset-password?token=${encodeURIComponent(token)}`;
      try {
        const { subject, text } = await renderEmailTemplate("PASSWORD_RESET", {
          recipient_name: current.name,
          reset_url: resetUrl,
          reset_expiry: describeResetExpiry(),
        });
        await sendEmail({ to: user.email, subject, text });
      } catch (error) {
        /**
         * Swallowed on purpose. The caller always answers "if that address exists, check your
         * email", and letting a send failure surface would turn this into a way of asking the app
         * which addresses are real. The action checks SMTP is configured first, so what reaches
         * here is a transient mail fault worth logging rather than reporting.
         */
        console.error("Password reset email failed to send:", error);
      }
    },
    /**
     * A successful reset clears the sign-in lockout — someone who was locked out and has just
     * proved they own the mailbox should not have to wait it out — and clears the request stamp so
     * the next genuine request is not throttled.
     */
    onPasswordReset: async ({ user }) => {
      await db.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null, passwordResetRequestedAt: null },
      });
    },
    password: {
      hash: hashPassword,
      verify: ({ hash: hashed, password }) => verifyPassword(hashed, password),
    },
  },
  user: {
    additionalFields: {
      phone: { type: "string", required: false, input: false },
      isActive: { type: "boolean", required: false, input: false, defaultValue: true },
      isSuperAdmin: { type: "boolean", required: false, input: false, defaultValue: false },
      roleId: { type: "string", required: false, input: false },
    },
  },
  session: {
    expiresIn: SESSION_MAX_SECONDS,
    updateAge: SESSION_REFRESH_SECONDS,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          // Deactivated users must not be able to sign in.
          const user = await db.user.findUnique({ where: { id: session.userId }, select: { isActive: true } });
          if (!user?.isActive) {
            throw new APIError("FORBIDDEN", { message: "Your account is inactive. Please contact your administrator." });
          }
          return { data: { ...session, expiresAt: await sessionExpiry() } };
        },
      },
      update: {
        before: async (session) => ({ data: { ...session, expiresAt: await sessionExpiry() } }),
      },
    },
  },
  advanced: {
    database: {
      // Let Prisma generate ids (cuid) so all tables share one id strategy.
      generateId: false,
    },
  },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
export type SessionUser = Session["user"];
