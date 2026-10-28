import type { PermissionModule } from "@/lib/generated/prisma/enums";

/**
 * The roles every company starts with.
 *
 * Shared by the seed and by onboarding a new customer, because they must be the same roles. When
 * this lived only in `prisma/seed.ts`, a company created through the app got none at all — its
 * first administrator would sign in with nothing to grant anybody.
 *
 * Presets, not rules: an administrator edits them freely under Users & Roles afterwards.
 */

export type Grant = [PermissionModule, { view: boolean; create: boolean; edit: boolean; delete: boolean }];
const ALL = { view: true, create: true, edit: true, delete: true };
const VIEW = { view: true, create: false, edit: false, delete: false };
const WORK = { view: true, create: true, edit: true, delete: false };
const MODULES: PermissionModule[] = ["CUSTOMERS", "SALES", "PROCUREMENT", "PROJECTS", "FINANCE", "USERS", "SETTINGS", "POS", "POS_ORDERS", "POS_KITCHEN", "POS_BOOKINGS", "INVENTORY"];

// Preset roles. Admins can adjust these later from Users & Roles.
export const PRESET_ROLES: { name: string; description: string; grants: Grant[] }[] = [
  {
    name: "Admin",
    description: "Full access to every module.",
    grants: MODULES.map((m) => [m, ALL]),
  },
  {
    name: "Sales User",
    description: "Manages customers, quotations and invoices.",
    grants: [
      ["CUSTOMERS", WORK],
      ["SALES", WORK],
      ["PROJECTS", VIEW],
    ],
  },
  {
    name: "Finance User",
    description: "Records income, expenses and payments.",
    grants: [
      ["FINANCE", ALL],
      ["CUSTOMERS", VIEW],
      ["SALES", VIEW],
      ["PROCUREMENT", VIEW],
      ["PROJECTS", VIEW],
    ],
  },
  {
    name: "Procurement User",
    description: "Manages suppliers, supplier quotations and purchases.",
    grants: [
      ["PROCUREMENT", WORK],
      ["CUSTOMERS", VIEW],
      ["PROJECTS", VIEW],
    ],
  },
  {
    name: "Stock Keeper",
    description: "Maintains the catalogue and stock levels.",
    grants: [
      ["INVENTORY", ALL],
      ["PROCUREMENT", VIEW],
    ],
  },
  {
    name: "Cashier",
    description: "Sells at the register and looks up customers.",
    grants: [
      ["POS", WORK],
      ["CUSTOMERS", WORK],
      // A cashier sells from the catalogue but does not maintain it.
      ["INVENTORY", VIEW],
      // Deliberately no floor plan, kitchen board or diary: those are other people's jobs.
    ],
  },
  {
    name: "Waiter",
    description: "Takes orders at tables, sends them through and settles the bill.",
    grants: [
      ["POS_ORDERS", WORK],
      // Settling a bill is a till action, so a waiter who takes payment needs this too.
      ["POS", WORK],
      // Enough of the kitchen to see whether an order is ready, not to move tickets.
      ["POS_KITCHEN", VIEW],
      ["INVENTORY", VIEW],
      ["CUSTOMERS", VIEW],
    ],
  },
  {
    name: "Kitchen",
    description: "Works the kitchen board and nothing else.",
    grants: [
      // The whole point of splitting POS: no sales history, no takings, no floor plan.
      ["POS_KITCHEN", WORK],
    ],
  },
  {
    name: "Receptionist",
    description: "Runs the appointment diary and takes payment at the desk.",
    grants: [
      ["POS_BOOKINGS", WORK],
      ["POS", WORK],
      ["CUSTOMERS", WORK],
      ["INVENTORY", VIEW],
    ],
  },
  {
    name: "Shift Supervisor",
    description: "Runs the shift: everything the floor staff do, plus voiding a mis-rung sale.",
    grants: [
      /**
       * The reason this role exists: voiding needs POS *delete*, and without it the only way to
       * let someone cancel a mis-rung sale was to make them a Branch Manager — which also hands
       * over purchasing and the finance reports. This runs the shift without running the business.
       */
      ["POS", ALL],
      ["POS_ORDERS", ALL],
      ["POS_KITCHEN", WORK],
      ["POS_BOOKINGS", WORK],
      ["CUSTOMERS", WORK],
      ["INVENTORY", VIEW],
    ],
  },
  {
    name: "Branch Manager",
    description: "Runs a branch: register, floor, kitchen, stock, purchases and reports.",
    grants: [
      ["POS", ALL],
      ["POS_ORDERS", ALL],
      ["POS_KITCHEN", ALL],
      ["POS_BOOKINGS", ALL],
      ["INVENTORY", ALL],
      ["CUSTOMERS", WORK],
      ["SALES", WORK],
      ["PROCUREMENT", WORK],
      ["FINANCE", VIEW],
      ["PROJECTS", VIEW],
    ],
  },
  {
    name: "Project User",
    description: "Manages projects and views related sales and purchases.",
    grants: [
      ["PROJECTS", WORK],
      ["CUSTOMERS", VIEW],
      ["SALES", VIEW],
      ["PROCUREMENT", VIEW],
    ],
  },
];
