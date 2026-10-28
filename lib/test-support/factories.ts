import "server-only";
import { db } from "@/lib/db";
// The sync one on purpose: `dbIt` and `startFreshDatabase` always wrap these in an
// explicit `runForCompany`, so the store really does hold a scope here.
import { requireCompanyId } from "@/lib/db/tenant";
import { getDocumentSequences } from "@/lib/data/settings";

/**
 * The smallest real rows an engine test needs.
 *
 * Built through Prisma rather than raw SQL so the tests feel the same defaults, constraints and
 * decimal precision the app does. Each factory returns only what a test is likely to assert on.
 */

export async function makeBranch(name = "Test Branch", isDefault = true) {
  return db.branch.create({ data: { code: `B${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name, isDefault, isActive: true } });
}

export async function makeAccount(name = "Cash Drawer", type: "CASH" | "COMPANY_BANK" = "CASH") {
  return db.paymentAccount.create({ data: { name, type, isActive: true, openingBalance: 0 } });
}

export async function makeCustomer(name = "Test Customer", extra: { vatNumber?: string } = {}) {
  return db.customer.create({ data: { name, type: "COMPANY", phone: "0500000000", isActive: true, ...extra } });
}

/**
 * A stocked product with one variant.
 *
 * `salePrice` is the catalogue price the engine must use — the tests lean on this to prove a
 * total sent by the till is ignored.
 */
export async function makeSupplier(name = "Test Supplier") {
  return db.supplier.create({ data: { name, type: "COMPANY", phone: "0500000001", isActive: true } });
}

export async function makeProduct(options: {
  name?: string;
  salePrice: number;
  costPrice?: number;
  vatRate?: number;
  trackStock?: boolean;
  branchId?: string;
  openingStock?: number;
}) {
  const item = await db.item.create({
    data: {
      kind: "PRODUCT",
      name: options.name ?? "Test Product",
      unit: "pcs",
      salePrice: options.salePrice,
      costPrice: options.costPrice ?? 0,
      vatRate: options.vatRate ?? 15,
      trackStock: options.trackStock ?? true,
      isActive: true,
      variants: { create: [{ name: options.name ?? "Test Product", sortOrder: 0, isActive: true, minStock: 0, reorderLevel: 0 }] },
    },
    include: { variants: true },
  });
  const variant = item.variants[0];

  if (options.branchId && options.openingStock !== undefined) {
    await db.stockLevel.create({ data: { variantId: variant.id, branchId: options.branchId, quantity: options.openingStock } });
  }
  return { item, variant };
}

/**
 * The settings rows the engines read. Created once per reset.
 *
 * Document sequences come from the app's own lazy creation rather than being invented here, so a
 * new document type added to `DOCUMENT_TYPES` is numbered in the tests exactly as in production.
 */
export async function makeSettings() {
  await getDocumentSequences();
  await db.appSettings.upsert({ where: { companyId: requireCompanyId() }, update: {}, create: {} });
  await db.companySettings.upsert({ where: { companyId: requireCompanyId() }, update: {}, create: { companyName: "Test Co" } });
  // `module` is a reserved identifier for a Next lint rule, even as a loop variable.
  for (const product of ["BUSINESS_MANAGEMENT", "POS"] as const) {
    await db.moduleSetting.upsert({
      where: { companyId_module: { companyId: requireCompanyId(), module: product } },
      update: { enabled: true },
      create: { module: product, enabled: true, enabledAt: new Date() },
    });
  }
}

/**
 * Somebody who works for the test company.
 *
 * `companyId` is written out, because `User` sits outside the tenant filter and nothing would
 * stamp it otherwise — which is how the app itself once created accounts belonging to nobody.
 * A test user with no company is invisible to every scoped read, so a suite built on them would
 * quietly be testing the wrong thing.
 */
export async function makeUser(name = "Test Cashier") {
  return db.user.create({
    data: {
      name,
      email: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}@test.invalid`,
      emailVerified: true,
      isActive: true,
      companyId: requireCompanyId(),
    },
  });
}

/** On-hand quantity for a variant at a branch, as a plain number. */
export async function stockLevel(variantId: string, branchId: string): Promise<number> {
  const row = await db.stockLevel.findUnique({ where: { variantId_branchId: { variantId, branchId } } });
  return row ? Number(row.quantity) : 0;
}
