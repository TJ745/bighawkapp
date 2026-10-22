import "server-only";
import { db } from "@/lib/db";
import type { AuthContext } from "@/lib/auth/session";

/**
 * Writes an entry to the audit trail. Best effort: a failed audit write must never roll back
 * the change the user asked for, so it is caught and logged.
 *
 * `userName` is stored alongside the id because the trail has to stay readable after a user is
 * renamed or removed.
 */
export async function recordAudit(input: {
  auth: AuthContext;
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  branchId?: string | null;
}) {
  try {
    await db.auditLog.create({
      data: {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary,
        metadata: input.metadata ? (input.metadata as object) : undefined,
        userId: input.auth.user.id,
        userName: input.auth.user.name,
        branchId: input.branchId ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] write failed", error);
  }
}
