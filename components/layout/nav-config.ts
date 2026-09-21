import {
  Bell,
  Briefcase,
  FolderKanban,
  LayoutDashboard,
  Lock,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
  UserCog,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { PermissionModule } from "@/lib/generated/prisma/enums";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  // Module whose "view" permission is required to see this item (undefined = everyone).
  module?: PermissionModule;
  children?: { title: string; href: string }[];
};

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Customers", href: "/customers", icon: Users, module: "CUSTOMERS" },
  {
    title: "Sales",
    href: "/sales",
    icon: Receipt,
    module: "SALES",
    children: [
      { title: "Quotations", href: "/sales/quotations" },
      { title: "Invoices", href: "/sales/invoices" },
    ],
  },
  {
    title: "Procurement",
    href: "/procurement",
    icon: ShoppingCart,
    module: "PROCUREMENT",
    children: [
      { title: "Suppliers", href: "/procurement/suppliers" },
      { title: "Supplier Quotations", href: "/procurement/supplier-quotations" },
      { title: "Purchases", href: "/procurement/purchases" },
    ],
  },
  { title: "Projects", href: "/projects", icon: FolderKanban, module: "PROJECTS" },
  {
    title: "Finance",
    href: "/finance",
    icon: Wallet,
    module: "FINANCE",
    children: [
      { title: "Income", href: "/finance/income" },
      { title: "Expenses", href: "/finance/expenses" },
      { title: "Customer Receivables", href: "/finance/receivables" },
      { title: "Supplier Payables", href: "/finance/payables" },
      { title: "Profit", href: "/finance/profit" },
    ],
  },
  { title: "Users & Roles", href: "/users", icon: UserCog, module: "USERS" },
  { title: "Settings", href: "/settings", icon: Settings, module: "SETTINGS" },
];

// Icon used for the company mark when no logo has been uploaded in Settings.
export const DEFAULT_COMPANY_ICON = Briefcase;

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
