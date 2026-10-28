import {
  Bell,
  Briefcase,
  FolderKanban,
  LayoutDashboard,
  Lock,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Users,
  UserCog,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AppModule, PermissionModule } from "@/lib/generated/prisma/enums";
import type { PosCapability } from "@/lib/platform/pos-types";

export type NavChild = {
  title: string;
  href: string;
  /** Only shown when the current branch's POS industry has this capability. */
  capability?: PosCapability;
  /**
   * Permission needed for this entry, when it differs from its parent's. The POS section holds
   * several jobs — till, floor, kitchen, diary, stock — so its children say which they belong to;
   * a child that says nothing inherits the parent's.
   */
  module?: PermissionModule;
};

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  // Module whose "view" permission is required to see this item (undefined = everyone).
  module?: PermissionModule;
  /** Product module this item belongs to; hidden when the company has not subscribed to it. */
  appModule?: AppModule;
  children?: NavChild[];
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    title: "Point of Sale",
    href: "/pos",
    icon: Store,
    module: "POS",
    appModule: "POS",
    children: [
      { title: "Register", href: "/pos/register", module: "POS" },
      { title: "Tables", href: "/pos/tables", capability: "TABLES", module: "POS_ORDERS" },
      { title: "Tabs", href: "/pos/tabs", capability: "TABS", module: "POS_ORDERS" },
      { title: "Appointments", href: "/pos/appointments", capability: "APPOINTMENTS", module: "POS_BOOKINGS" },
      { title: "Staff & commission", href: "/pos/staff", capability: "STAFF_COMMISSION", module: "INVENTORY" },
      { title: "Memberships", href: "/pos/memberships", capability: "MEMBERSHIPS", module: "INVENTORY" },
      { title: "Price lists", href: "/pos/price-lists", capability: "PRICE_LISTS", module: "INVENTORY" },
      { title: "Work orders", href: "/pos/work-orders", capability: "WORK_ORDERS", module: "POS" },
      { title: "Events", href: "/pos/events", capability: "TICKETS", module: "INVENTORY" },
      { title: "Rooms", href: "/pos/rooms", capability: "ROOMS", module: "POS" },
      { title: "Rentals", href: "/pos/rentals", capability: "RENTALS", module: "POS" },
      { title: "Kitchen", href: "/pos/kitchen", capability: "KITCHEN", module: "POS_KITCHEN" },
      { title: "Sales", href: "/pos/sales", module: "POS" },
      { title: "What Sold", href: "/pos/reports", module: "POS" },
      { title: "Returns", href: "/pos/returns", module: "POS" },
      { title: "Shifts", href: "/pos/shifts", module: "POS" },
      { title: "Products & Services", href: "/pos/products", module: "INVENTORY" },
      { title: "Categories", href: "/pos/categories", module: "INVENTORY" },
      { title: "Modifiers", href: "/pos/modifiers", capability: "MODIFIERS", module: "INVENTORY" },
      { title: "Recipes", href: "/pos/recipes", capability: "RECIPES", module: "INVENTORY" },
      { title: "Stock", href: "/pos/stock", module: "INVENTORY" },
      { title: "Registers", href: "/pos/registers", module: "INVENTORY" },
      { title: "Overview", href: "/pos" },
    ],
  },
  { title: "Customers", href: "/customers", icon: Users, module: "CUSTOMERS", appModule: "BUSINESS_MANAGEMENT" },
  {
    title: "Sales",
    href: "/sales",
    icon: Receipt,
    module: "SALES",
    appModule: "BUSINESS_MANAGEMENT",
    children: [
      { title: "Quotations", href: "/sales/quotations" },
      { title: "Invoices", href: "/sales/invoices" },
      { title: "Credit notes", href: "/sales/credit-notes" },
    ],
  },
  {
    title: "Procurement",
    href: "/procurement",
    icon: ShoppingCart,
    module: "PROCUREMENT",
    appModule: "BUSINESS_MANAGEMENT",
    children: [
      { title: "Suppliers", href: "/procurement/suppliers" },
      { title: "Supplier Quotations", href: "/procurement/supplier-quotations" },
      { title: "Purchases", href: "/procurement/purchases" },
    ],
  },
  { title: "Projects", href: "/projects", icon: FolderKanban, module: "PROJECTS", appModule: "BUSINESS_MANAGEMENT" },
  {
    title: "Finance",
    href: "/finance",
    icon: Wallet,
    module: "FINANCE",
    appModule: "BUSINESS_MANAGEMENT",
    children: [
      { title: "Income", href: "/finance/income" },
      { title: "Expenses", href: "/finance/expenses" },
      { title: "Customer Receivables", href: "/finance/receivables" },
      { title: "Supplier Payables", href: "/finance/payables" },
      { title: "Profit", href: "/finance/profit" },
      { title: "VAT", href: "/finance/vat" },
    ],
  },
  { title: "Users & Roles", href: "/users", icon: UserCog, module: "USERS" },
  { title: "Settings", href: "/settings", icon: Settings, module: "SETTINGS" },
];

// Icon used for the company mark when no logo has been uploaded in Settings.
export const DEFAULT_COMPANY_ICON = Briefcase;

/**
 * The navigation a given user sees: items for modules the company subscribes to, that the user
 * has permission for, whose industry capability the current branch has. Pure, so the sidebar and
 * any other consumer agree — but never the authorisation itself, which is server-side.
 */
export function visibleNavItems(options: {
  visibleModules: PermissionModule[];
  enabledModules: AppModule[];
  capabilities: PosCapability[];
}): NavItem[] {
  /** A child needs its own permission where it has one, otherwise its parent's. */
  const childVisible = (item: NavItem, child: NavChild) => {
    const required = child.module ?? item.module;
    return (
      (!required || options.visibleModules.includes(required)) && (!child.capability || options.capabilities.includes(child.capability))
    );
  };

  return NAV_ITEMS.filter((item) => !item.appModule || options.enabledModules.includes(item.appModule))
    .map((item) => ({ ...item, children: item.children?.filter((child) => childVisible(item, child)) }))
    .filter((item) =>
      /**
       * A section with children is worth showing when **any** of them is — the POS section holds
       * several jobs, so a kitchen hand with no till permission must still see Kitchen, and a stock
       * keeper with no POS permission must still see Products and Stock. A section is never shown
       * empty, which is what makes dropping the parent's own permission check safe here.
       */
      item.children ? item.children.length > 0 : !item.module || options.visibleModules.includes(item.module),
    );
}

// Pages reached from the header (not the sidebar) still deserve a breadcrumb.
const OFF_NAV_PAGES: NavItem[] = [
  { title: "Notifications", href: "/notifications", icon: Bell },
  { title: "My Profile", href: "/profile", icon: UserRound },
  { title: "Access denied", href: "/access-denied", icon: Lock },
];

// Finds the nav entry (and optional child) for a pathname; used for breadcrumbs/titles.
export function findNavForPath(pathname: string) {
  for (const item of NAV_ITEMS) {
    const child = item.children?.find((c) => pathname === c.href || pathname.startsWith(`${c.href}/`));
    if (child) return { item, child };
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return { item, child: undefined };
  }
  const offNav = OFF_NAV_PAGES.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return offNav ? { item: offNav, child: undefined } : undefined;
}
