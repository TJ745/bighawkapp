import type { PermissionModule } from "@/lib/generated/prisma/enums";

export const PERMISSION_MODULES: { value: PermissionModule; label: string }[] = [
  { value: "CUSTOMERS", label: "Customers" },
  { value: "SALES", label: "Sales" },
  { value: "PROCUREMENT", label: "Procurement" },
  { value: "PROJECTS", label: "Projects" },
  { value: "FINANCE", label: "Finance" },
  { value: "USERS", label: "Users & Roles" },
  { value: "SETTINGS", label: "Settings" },
];

export const PERMISSION_ACTIONS = ["view", "create", "edit", "delete"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export type ModulePermissions = Record<PermissionAction, boolean>;
export type PermissionMap = Partial<Record<PermissionModule, ModulePermissions>>;
