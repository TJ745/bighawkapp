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
        /**
         * BigHawk's own operator, working inside a customer's company.
         *
         * The row still belongs to that company — it is the only log where "their invoice was
         * edited" means anything — but their staff are not shown it, and the operator sees it
         * across every customer. Taken from the signed-in account rather than passed in, so no
         * call site can forget it or claim otherwise.
         */
        byPlatform: input.auth.user.isSuperAdmin,
      },
    });
  } catch (error) {
    console.error("[audit] write failed", error);
  }
}

/**
 * An amount inside an audit summary.
 *
 * Deliberately **not** `getFormatters()`. A trail entry is a record of something that happened,
 * written once and read back months later, so it must not quietly change its meaning because
 * somebody switched the number format in Settings afterwards — and a settings read on every
 * audited action would be a query nobody asked for. Fixed, grouped, currency named.
 */
const auditNumber = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function auditMoney(value: number | string | { toString(): string }): string {
  return `SAR ${auditNumber.format(Number(value))}`;
}
