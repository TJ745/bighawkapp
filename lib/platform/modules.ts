import type { AppModule, PermissionModule } from "@/lib/generated/prisma/enums";

/**
 * The product modules a BigHawk company can subscribe to. Everything outside these modules
 * (dashboard, users, settings, profile) is core and always present.
 *
 * Client-safe: no server imports, so navigation and forms can read the same registry the
 * server authorises against.
 */
export type ModuleInfo = {
  value: AppModule;
  label: string;
  description: string;
  /** What the customer loses if it is switched off — shown on the Modules screen. */
  includes: string[];
};

export const APP_MODULES: ModuleInfo[] = [
  {
    value: "BUSINESS_MANAGEMENT",
    label: "Business Management",
    description: "Quotations, invoices, purchases, projects and the money that flows through them.",
    includes: ["Customers", "Sales (quotations & invoices)", "Procurement (suppliers & purchases)", "Projects", "Finance & reports"],
  },
  {
    value: "POS",
    label: "Point of Sale",
    description: "Counter selling, configured for the industry each branch runs.",
    includes: ["POS registers & shifts", "Products, services & inventory", "Industry features (tables, modifiers, appointments…)"],
  },
];

export const ALL_MODULES: AppModule[] = APP_MODULES.map((m) => m.value);

export function moduleLabel(module: AppModule) {
  return APP_MODULES.find((m) => m.value === module)?.label ?? module;
}

/**
 * Which product module each permission module lives in. This is what makes a disabled module
 * close everything behind it in one place: `can()` consults this map, so every existing page and
 * Server Action became module-aware without being edited.
 *
 * Users, Settings and the dashboard are core — they have no entry and are always reachable.
 */
const PERMISSION_MODULE_OWNER: Partial<Record<PermissionModule, AppModule>> = {
  CUSTOMERS: "BUSINESS_MANAGEMENT",
  SALES: "BUSINESS_MANAGEMENT",
  PROCUREMENT: "BUSINESS_MANAGEMENT",
  PROJECTS: "BUSINESS_MANAGEMENT",
  FINANCE: "BUSINESS_MANAGEMENT",
  // The POS side is split by job — till, floor, kitchen, diary — but all of it belongs to the one
  // product module, so switching POS off still closes every one of them from here.
  POS: "POS",
  POS_ORDERS: "POS",
  POS_KITCHEN: "POS",
  POS_BOOKINGS: "POS",
  INVENTORY: "POS",
};

export function appModuleOf(module: PermissionModule): AppModule | undefined {
  return PERMISSION_MODULE_OWNER[module];
}

/** Permission modules worth showing in the role editor for the modules a company has. */
export function permissionModulesFor(enabled: AppModule[]): PermissionModule[] {
  return (Object.keys(PERMISSION_MODULE_OWNER) as PermissionModule[])
    .filter((m) => enabled.includes(PERMISSION_MODULE_OWNER[m]!))
    .concat(["USERS", "SETTINGS"]);
}
