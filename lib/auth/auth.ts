import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { hash, verify } from "@node-rs/argon2";
import { db } from "@/lib/db";

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
  const settings = await db.appSettings.findUnique({ where: { id: "default" }, select: { sessionTimeoutMinutes: true } });
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
