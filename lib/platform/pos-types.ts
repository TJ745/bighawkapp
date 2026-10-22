import type { PosBusinessType } from "@/lib/generated/prisma/enums";

/**
 * POS industries and what each one can do.
 *
 * The rest of the app never asks "is this a restaurant?" — it asks "does this branch have the
 * TABLES capability?". Adding an industry therefore means adding one row to POS_BUSINESS_TYPES,
 * not touching navigation, pages or business logic. Adding a *feature* means adding one
 * capability here plus the module that implements it.
 *
 * Client-safe: no server imports.
 */

export const POS_CAPABILITIES = [
  // Selling
  "BARCODE", // scanner-driven selling (retail, grocery)
  "VARIANTS", // size/colour matrices (apparel, specialty retail)
  "WEIGHT", // scale/weighed items (grocery, bakery)
  "QUICK_ORDER", // single-screen fast ordering (QSR, food truck)
  "PRICE_LISTS", // customer/quantity pricing (wholesale, B2B)
  // Food & beverage
  "TABLES", // floor plan, dine-in table service
  "MODIFIERS", // options that change price (cafe, bakery, QSR)
  "KITCHEN", // kitchen display / ticket routing
  "RECIPES", // ingredient deduction
  "TABS", // open tabs carried across rounds (bar, pub)
  // Services
  "APPOINTMENTS", // calendar-booked services (salon, spa)
  "STAFF_COMMISSION", // per-staff commission on services
  "MEMBERSHIPS", // recurring plans (gym, spa, salon)
  "WORK_ORDERS", // intake → diagnosis → repair → delivery
  // Leisure & lodging
  "TICKETS", // events, showtimes, seats
  "ROOMS", // reservations and guest folios
  "RENTALS", // equipment out and back
] as const;

export type PosCapability = (typeof POS_CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<PosCapability, string> = {
  BARCODE: "Barcode selling",
  VARIANTS: "Product variants",
  WEIGHT: "Weighed items",
  QUICK_ORDER: "Quick order screen",
  PRICE_LISTS: "Price lists & tiers",
  TABLES: "Tables & floor plan",
  MODIFIERS: "Item modifiers",
  KITCHEN: "Kitchen display",
  RECIPES: "Recipes & ingredients",
  TABS: "Open tabs",
  APPOINTMENTS: "Appointments",
  STAFF_COMMISSION: "Staff commission",
  MEMBERSHIPS: "Memberships",
  WORK_ORDERS: "Work orders",
  TICKETS: "Tickets & events",
  ROOMS: "Rooms & reservations",
  RENTALS: "Equipment rental",
};

/** Industry groups, used to keep the picker readable as the list grows. */
export const POS_INDUSTRY_GROUPS = ["Retail", "Food & Beverage", "Services", "Leisure", "Wholesale", "Other"] as const;
export type PosIndustryGroup = (typeof POS_INDUSTRY_GROUPS)[number];

export type PosTypeInfo = {
  value: PosBusinessType;
  label: string;
  group: PosIndustryGroup;
  description: string;
  capabilities: PosCapability[];
};

// Every capability listed here is one a later phase implements; the POS engine itself
// (cart, payments, receipts, shifts) is common to every type and never listed.
export const POS_BUSINESS_TYPES: PosTypeInfo[] = [
  {
    value: "RETAIL",
    label: "General Retail",
    group: "Retail",
    description: "Counter selling with barcodes and stock.",
    capabilities: ["BARCODE", "VARIANTS"],
  },
  {
    value: "GROCERY",
    label: "Grocery / Supermarket",
    group: "Retail",
    description: "Barcodes, weighed goods and fast-moving stock.",
    capabilities: ["BARCODE", "WEIGHT"],
  },
  {
    value: "APPAREL",
    label: "Apparel / Boutique",
    group: "Retail",
    description: "Size and colour matrices per product.",
    capabilities: ["BARCODE", "VARIANTS"],
  },
  {
    value: "RESTAURANT",
    label: "Full-Service Restaurant",
    group: "Food & Beverage",
    description: "Table service with kitchen routing.",
    capabilities: ["TABLES", "MODIFIERS", "KITCHEN", "RECIPES"],
  },
  {
    value: "QSR",
    label: "Quick Service / Fast Food",
    group: "Food & Beverage",
    description: "Order numbers and a fast single screen.",
    capabilities: ["QUICK_ORDER", "MODIFIERS", "KITCHEN"],
  },
  {
    value: "CAFE",
    label: "Cafe / Coffee Shop",
    group: "Food & Beverage",
    description: "Drinks built from modifiers and recipes.",
    capabilities: ["QUICK_ORDER", "MODIFIERS", "RECIPES"],
  },
  {
    value: "BAKERY",
    label: "Bakery",
    group: "Food & Beverage",
    description: "Counter selling with weighed goods and recipes.",
    capabilities: ["BARCODE", "WEIGHT", "MODIFIERS", "RECIPES"],
  },
  {
    value: "BAR",
    label: "Bar / Pub",
    group: "Food & Beverage",
    description: "Open tabs carried across rounds.",
    capabilities: ["TABS", "TABLES", "MODIFIERS"],
  },
  {
    value: "FOOD_TRUCK",
    label: "Food Truck / Pop-up",
    group: "Food & Beverage",
    description: "One screen, minimal setup.",
    capabilities: ["QUICK_ORDER", "MODIFIERS"],
  },
  {
    value: "SALON",
    label: "Salon",
    group: "Services",
    description: "Booked services, staff and commission.",
    capabilities: ["APPOINTMENTS", "STAFF_COMMISSION", "MEMBERSHIPS"],
  },
  {
    value: "SPA",
    label: "Spa",
    group: "Services",
    description: "Treatments, packages and memberships.",
    capabilities: ["APPOINTMENTS", "STAFF_COMMISSION", "MEMBERSHIPS"],
  },
  {
    value: "GYM",
    label: "Gym / Fitness Studio",
    group: "Services",
    description: "Memberships, classes and check-in.",
    capabilities: ["MEMBERSHIPS", "APPOINTMENTS"],
  },
  {
    value: "REPAIR",
    label: "Repair Shop",
    group: "Services",
    description: "Work orders for devices and vehicles: intake to delivery.",
    capabilities: ["WORK_ORDERS", "BARCODE"],
  },
  {
    value: "WHOLESALE",
    label: "Wholesale / B2B",
    group: "Wholesale",
    description: "Customer pricing, quantity tiers and fulfilment.",
    capabilities: ["PRICE_LISTS", "BARCODE", "VARIANTS"],
  },
  {
    value: "HOTEL",
    label: "Hotel / Lodging",
    group: "Leisure",
    description: "Rooms and guest folios that POS charges post to.",
    capabilities: ["ROOMS", "MODIFIERS"],
  },
  {
    value: "CINEMA",
    label: "Cinema",
    group: "Leisure",
    description: "Showtimes, seats and concessions.",
    capabilities: ["TICKETS", "BARCODE"],
  },
  {
    value: "ENTERTAINMENT",
    label: "Entertainment / Venue",
    group: "Leisure",
    description: "Events, timed entry and rentals.",
    capabilities: ["TICKETS", "RENTALS"],
  },
  {
    value: "OTHER",
    label: "Other",
    group: "Other",
    description: "The common POS engine with no industry extras.",
    capabilities: [],
  },
];

export function posTypeInfo(type: PosBusinessType): PosTypeInfo {
  return POS_BUSINESS_TYPES.find((t) => t.value === type) ?? POS_BUSINESS_TYPES[POS_BUSINESS_TYPES.length - 1];
}

export function posTypeLabel(type: PosBusinessType) {
  return posTypeInfo(type).label;
}

/** Whether a branch running `type` has a capability. The only question feature code should ask. */
export function posTypeHasCapability(type: PosBusinessType, capability: PosCapability) {
  return posTypeInfo(type).capabilities.includes(capability);
}
