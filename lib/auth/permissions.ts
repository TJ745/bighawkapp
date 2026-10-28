import type { PermissionModule } from "@/lib/generated/prisma/enums";

/**
 * Every permission a role can be granted, in the order the role editor shows them.
 *
 * This list **is** the role editor: a module missing from it cannot be granted through the UI at
 * all, whatever the database allows. `INVENTORY` was missing, which is why the catalogue and stock
 * rights could only ever be handed out by the seed — a test now keeps the list complete.
 *
 * The POS entries are split by job rather than by screen, so a kitchen hand, a waiter and a
 * cashier can work the same shop without seeing each other's screens. The description says who the
 * permission is for, because "POS_ORDERS" means nothing to a shop owner ticking a box.
 */
export const PERMISSION_MODULES: { value: PermissionModule; label: string; description?: string }[] = [
  { value: "CUSTOMERS", label: "Customers" },
  { value: "SALES", label: "Sales" },
  { value: "PROCUREMENT", label: "Procurement" },
  { value: "PROJECTS", label: "Projects" },
  { value: "FINANCE", label: "Finance" },
  { value: "USERS", label: "Users & Roles" },
  { value: "SETTINGS", label: "Settings" },
  { value: "POS", label: "Till & sales", description: "Register, returns, sales history, shifts, work orders, rentals and rooms." },
  { value: "POS_ORDERS", label: "Tables & tabs", description: "Taking orders on the floor. What a waiter needs." },
  { value: "POS_KITCHEN", label: "Kitchen board", description: "Seeing and moving kitchen tickets, and nothing else." },
  { value: "POS_BOOKINGS", label: "Appointments", description: "The diary. What a front desk needs." },
  { value: "INVENTORY", label: "Products & stock", description: "The catalogue, stock levels and the POS setup screens." },
];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type ModulePermissions = Record<PermissionAction, boolean>;
export type PermissionMap = Partial<Record<PermissionModule, ModulePermissions>>;
