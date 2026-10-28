/**
 * How the activity log is grouped for a reader, and the shape of one entry.
 *
 * Client-safe on purpose: the filter pills and the table are a client component, and the
 * queries behind them live in `lib/data/audit.ts`, which is `server-only` and drags the whole
 * database and auth graph with it. The same split every registry in `lib/platform` makes.
 */

/** An action string is `area.thing_done`; the area is what people actually filter by. */
export const AUDIT_AREAS = [
  { value: "all", label: "Everything" },
  { value: "sales", label: "Sales" },
  { value: "customer", label: "Customers" },
  { value: "procurement", label: "Procurement" },
  { value: "finance", label: "Finance" },
  { value: "supplier", label: "Suppliers" },
  { value: "pos", label: "Point of sale" },
  { value: "stock", label: "Stock" },
  { value: "project", label: "Projects" },
  { value: "item", label: "Catalogue" },
  { value: "branch", label: "Branches" },
  { value: "user", label: "Users" },
  { value: "settings", label: "Settings" },
  { value: "export", label: "Exports" },
  { value: "platform", label: "Platform" },
] as const;

export type AuditArea = (typeof AUDIT_AREAS)[number]["value"];

export type AuditEntry = {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
  userName: string;
  userId: string | null;
  createdAt: Date;
  /** Only filled in on the operator's across-companies view. */
  companyName: string | null;
};
