import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Single Prisma client per process. In development the module is re-evaluated
// on hot reload, so we cache the instance on globalThis to avoid exhausting
// the Neon connection pool.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Used only when DATABASE_URL is missing (e.g. during `next build` without env),
// so the client can be constructed and any real query fails with an obvious host name.
const MISSING_URL = "postgresql://missing:missing@DATABASE_URL-is-not-set.invalid:5432/missing";

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn("[db] DATABASE_URL is not set. Add it to your .env file; database queries will fail.");
  }
  const adapter = new PrismaPg({ connectionString: connectionString || MISSING_URL });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Document creation serialises on the numbering row lock; allow bursts to queue
    // for a pool slot instead of failing after Prisma's 2s default.
    transactionOptions: { maxWait: 15_000, timeout: 30_000 },
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
