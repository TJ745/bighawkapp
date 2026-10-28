/**
 * The demonstration company a salesperson shows a prospect.
 *
 * One customer — a small group running four different kinds of shop — so a single sign-in and
 * the header's branch switcher walk through most of what BigHawk does:
 *
 *   Restaurant  tables, kitchen board, modifiers, recipes
 *   Cafe        collection numbers, one-tap cash, modifiers
 *   Boutique    barcodes, size and colour variants
 *   Salon       appointments, staff commission, memberships
 *
 * Three rules this file keeps, because a demo that breaks any of them argues against the
 * product rather than for it:
 *
 * 1. **Every date is counted back from today.** A demo whose newest invoice is from March looks
 *    abandoned, and it is the first thing a prospect notices.
 * 2. **Money is made by the real engines.** POS sales go through `createSale`, invoice lines
 *    through `buildItemRows`. Writing rows by hand would produce figures the app's own reports
 *    disagree with — the demo would contradict itself on screen.
 * 3. **The states that sell the software are present.** An overdue invoice, a part-paid one, a
 *    credit note, stock under its minimum, takings across several shifts. Aging, statements, the
 *    VAT return and the dashboard are the best arguments in here and every one of them is blank
 *    without data in those states.
 *
 * Run it with `npm run demo:reset`, which wipes the demo company and builds it again. It can
 * only ever touch a company marked `isDemo`.
 */
import "server-only";
import { db } from "@/lib/db";
import { requireCompanyId, runAsPlatform, runForCompany } from "@/lib/db/tenant";
import { seedCompanyDefaults } from "@/lib/platform/new-company";
import { createSale, resolveCart } from "@/lib/business/pos";
import { applyStockMovement } from "@/lib/business/inventory";
import { buildItemRows } from "@/lib/business/sales";
import { getAppSettings } from "@/lib/data/settings";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { addDays, parseDateOnly } from "@/lib/dates";
import type { PosBusinessType } from "@/lib/generated/prisma/enums";

/** The handle the demo always lives under, so the reset knows what to look for. */
export const DEMO_SLUG = "demo";

const DEMO_ADMIN = {
  name: "Demo Manager",
  email: "demo@bighawk.sa",
  password: process.env.DEMO_PASSWORD ?? "Demo12345",
};

/** Today as `YYYY-MM-DD`, which is what the engines take. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** `n` days ago, as `YYYY-MM-DD`. Everything in here is dated relative to the run. */
function daysAgo(n: number): string {
  return addDays(todayIso(), -n);
}

/** Deterministic pseudo-randomness, so two runs produce a comparable shop. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}
const rand = makeRandom(20261028);

function pick<T>(items: T[]): T {
  return items[Math.floor(rand() * items.length)] ?? items[0];
}

// ---------------------------------------------------------------------------
// Wiping
// ---------------------------------------------------------------------------

/**
 * Removes the demo company entirely.
 *
 * Guarded twice — by the handle and by `isDemo` — because this deletes a company and everything
 * cascading from it, and the only thing standing between "reset the demo" and "delete a paying
 * customer" is which row it matched.
 *
 * Users are deleted **by hand**: `User.companyId` is an optional relation, so deleting a company
 * sets it null rather than removing the account, and the next run would collide on the email
 * address while leaving orphans behind.
 */
export async function wipeDemo(): Promise<void> {
  await runAsPlatform("resetting the demonstration company", async () => {
    const demo = await db.company.findFirst({ where: { slug: DEMO_SLUG }, select: { id: true, isDemo: true, name: true } });
    if (!demo) return;
    if (!demo.isDemo) {
      throw new Error(`The company using the handle "${DEMO_SLUG}" is not marked as a demo. Refusing to delete ${demo.name}.`);
    }

    const users = await db.user.findMany({ where: { companyId: demo.id }, select: { id: true } });
    const ids = users.map((user) => user.id);
    if (ids.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.account.deleteMany({ where: { userId: { in: ids } } });
      await db.notification.deleteMany({ where: { userId: { in: ids } } });
      // The trail goes with the company; the author reference would otherwise block the delete.
      await db.auditLog.updateMany({ where: { userId: { in: ids } }, data: { userId: null } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
    }
    await db.company.delete({ where: { id: demo.id } });
  });
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

type BranchPlan = { code: string; name: string; type: PosBusinessType; city: string };

const BRANCHES: BranchPlan[] = [
  { code: "MAIN", name: "Al Noor Restaurant", type: "RESTAURANT", city: "Riyadh" },
  { code: "CAFE", name: "Al Noor Cafe", type: "CAFE", city: "Riyadh" },
  { code: "SHOP", name: "Al Noor Boutique", type: "RETAIL", city: "Jeddah" },
  { code: "SALON", name: "Al Noor Salon", type: "SALON", city: "Riyadh" },
];

export async function seedDemo(): Promise<{ companyId: string; email: string; password: string }> {
  const company = await runAsPlatform("creating the demonstration company", () =>
    db.company.create({
      data: {
        name: "Al Noor Group",
        slug: DEMO_SLUG,
        isDemo: true,
        // Generous on purpose: a limit reached in front of a prospect is not the feature to show.
        userLimit: 25,
        branchLimit: 10,
      },
    }),
  );

  await runForCompany(company.id, async () => {
    // Roles, module rows, settings, MAIN and the administrator — the same start every customer
    // gets, through the same function, so the demo cannot drift from a real onboarding.
    await seedCompanyDefaults("Al Noor Group", DEMO_ADMIN);

    await db.moduleSetting.updateMany({ where: { module: "POS" }, data: { enabled: true, enabledAt: new Date() } });
    await db.companySettings.updateMany({
      data: {
        companyName: "Al Noor Group",
        vatNumber: "300012345600003",
        crNumber: "1010123456",
        phone: "+966 11 234 5678",
        email: "hello@alnoor.example",
        city: "Riyadh",
        address: "King Fahd Road, Riyadh",
      },
    });

    const branchIds = await seedBranches();
    await seedColleagues();
    const accounts = await seedAccounts();
    const staff = await seedStaff(branchIds.SALON);
    const catalogue = await seedCatalogue(branchIds);
    await seedOpeningStock(catalogue, branchIds);
    const registers = await seedRegisters(branchIds, accounts.cash);
    await seedTables(branchIds.MAIN);
    await seedTillSales({ branchIds, registers, catalogue, accounts, staff });
    await seedBusinessManagement(accounts);
  });

  return { companyId: company.id, email: DEMO_ADMIN.email, password: DEMO_ADMIN.password };
}

/**
 * Two more people beside the manager.
 *
 * Not decoration: a Users screen with one row says nothing about roles, and the activity log
 * reads oddly when every entry has the same name against it.
 */
async function seedColleagues() {
  const roles = await db.role.findMany({ where: { name: { in: ["Cashier", "Finance User"] } }, select: { id: true, name: true } });
  for (const person of [
    { name: "Omar Al Shehri", email: "omar@alnoor.example", role: "Cashier" },
    { name: "Fatima Al Ghamdi", email: "fatima@alnoor.example", role: "Finance User" },
  ]) {
    const role = roles.find((r) => r.name === person.role);
    await db.user.create({
      data: {
        name: person.name,
        email: person.email,
        roleId: role?.id ?? null,
        isActive: true,
        emailVerified: true,
        // Stamped by hand: `User` sits outside the tenant filter. No password — these two are
        // here to populate a screen, and an account nobody can sign in to is the safer demo.
        companyId: requireCompanyId(),
      },
    });
  }
}

/** The four shops, each with the industry that decides what its till looks like. */
async function seedBranches(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};

  for (const plan of BRANCHES) {
    const branch =
      plan.code === "MAIN"
        ? // `seedCompanyDefaults` already made MAIN; it becomes the restaurant rather than a fifth shop.
          await db.branch.update({ where: { id: (await db.branch.findFirstOrThrow({ where: { code: "MAIN" } })).id }, data: { name: plan.name, city: plan.city } })
        : await db.branch.create({ data: { code: plan.code, name: plan.name, city: plan.city, isDefault: false } });

    ids[plan.code] = branch.id;
    await db.posConfiguration.create({
      data: {
        branchId: branch.id,
        businessType: plan.type,
        receiptHeader: plan.name,
        receiptFooter: "Thank you — شكراً لزيارتكم",
      },
    });
  }

  return ids;
}

async function seedAccounts() {
  const cash = await db.paymentAccount.create({ data: { name: "Cash Drawer", type: "CASH", openingBalance: 2000 } });
  const bank = await db.paymentAccount.create({ data: { name: "Al Rajhi Current", type: "COMPANY_BANK", openingBalance: 85000 } });
  return { cash: cash.id, bank: bank.id };
}

/** Stylists, so commission and the appointments diary have somebody to belong to. */
async function seedStaff(salonBranchId: string) {
  const people = [
    { name: "Hind Al Qahtani", commissionPercent: 15 },
    { name: "Reem Al Dossari", commissionPercent: 12 },
  ];
  const made: string[] = [];
  for (const person of people) {
    const row = await db.staffMember.create({ data: { ...person, branchId: salonBranchId, isActive: true } });
    made.push(row.id);
  }
  return made;
}

type Catalogue = Awaited<ReturnType<typeof seedCatalogue>>;

/**
 * What each shop sells.
 *
 * Every item names the branch that sells it, which is the whole point of `Item.branchId`: without
 * it the restaurant's till would list shampoo and the boutique's would list shawarma.
 */
async function seedCatalogue(branchIds: Record<string, string>) {
  const category = async (name: string) => (await db.itemCategory.create({ data: { name } })).id;

  const food = await category("Food");
  const drinks = await category("Drinks");
  const clothing = await category("Clothing");
  const services = await category("Salon services");
  const haircare = await category("Hair care");

  /** One item with one default variant — the shape everything in the app assumes. */
  async function simple(opts: {
    name: string;
    branchId: string | null;
    categoryId: string;
    salePrice: number;
    costPrice: number;
    kind?: "PRODUCT" | "SERVICE";
    trackStock?: boolean;
    unit?: string;
    sku?: string;
    barcode?: string;
    durationMinutes?: number;
  }) {
    const kind = opts.kind ?? "PRODUCT";
    const trackStock = opts.trackStock ?? kind === "PRODUCT";
    const item = await db.item.create({
      data: {
        kind,
        name: opts.name,
        branchId: opts.branchId,
        categoryId: opts.categoryId,
        salePrice: opts.salePrice,
        costPrice: opts.costPrice,
        unit: opts.unit ?? "pcs",
        trackStock,
        durationMinutes: opts.durationMinutes ?? null,
        variants: {
          create: {
            name: "Default",
            isDefault: true,
            sku: opts.sku ?? null,
            barcode: opts.barcode ?? null,
            minStock: trackStock ? 5 : 0,
          },
        },
      },
      include: { variants: true },
    });
    return { itemId: item.id, variantId: item.variants[0].id, trackStock, salePrice: opts.salePrice };
  }

  const restaurant = [
    await simple({ name: "Mixed Grill", branchId: branchIds.MAIN, categoryId: food, salePrice: 85, costPrice: 38 }),
    await simple({ name: "Chicken Shawarma", branchId: branchIds.MAIN, categoryId: food, salePrice: 18, costPrice: 6 }),
    await simple({ name: "Hummus", branchId: branchIds.MAIN, categoryId: food, salePrice: 16, costPrice: 4 }),
    await simple({ name: "Lamb Mandi", branchId: branchIds.MAIN, categoryId: food, salePrice: 65, costPrice: 29 }),
    await simple({ name: "Fresh Lemon Mint", branchId: branchIds.MAIN, categoryId: drinks, salePrice: 14, costPrice: 3 }),
  ];

  const cafe = [
    await simple({ name: "Flat White", branchId: branchIds.CAFE, categoryId: drinks, salePrice: 16, costPrice: 4 }),
    await simple({ name: "Spanish Latte", branchId: branchIds.CAFE, categoryId: drinks, salePrice: 19, costPrice: 5 }),
    await simple({ name: "V60 Filter", branchId: branchIds.CAFE, categoryId: drinks, salePrice: 22, costPrice: 6 }),
    await simple({ name: "Butter Croissant", branchId: branchIds.CAFE, categoryId: food, salePrice: 12, costPrice: 4 }),
    await simple({ name: "Date Cake", branchId: branchIds.CAFE, categoryId: food, salePrice: 15, costPrice: 5 }),
  ];

  // The boutique sells one item in several sizes and colours, which is what `VARIANTS` is for.
  const abaya = await db.item.create({
    data: {
      kind: "PRODUCT",
      name: "Linen Abaya",
      branchId: branchIds.SHOP,
      categoryId: clothing,
      salePrice: 320,
      costPrice: 140,
      trackStock: true,
      variants: {
        create: [
          { name: "Black / S", sku: "ABY-BK-S", barcode: "6281000000011", attributes: { Colour: "Black", Size: "S" }, minStock: 2 },
          { name: "Black / M", sku: "ABY-BK-M", barcode: "6281000000028", attributes: { Colour: "Black", Size: "M" }, isDefault: true, minStock: 2 },
          { name: "Navy / M", sku: "ABY-NV-M", barcode: "6281000000035", attributes: { Colour: "Navy", Size: "M" }, minStock: 2 },
        ],
      },
    },
    include: { variants: true },
  });

  const boutique = [
    ...abaya.variants.map((v) => ({ itemId: abaya.id, variantId: v.id, trackStock: true, salePrice: 320 })),
    await simple({ name: "Silk Scarf", branchId: branchIds.SHOP, categoryId: clothing, salePrice: 95, costPrice: 36, sku: "SCF-001", barcode: "6281000000042" }),
    await simple({ name: "Leather Belt", branchId: branchIds.SHOP, categoryId: clothing, salePrice: 140, costPrice: 55, sku: "BLT-001", barcode: "6281000000059" }),
  ];

  const salon = [
    await simple({ name: "Ladies Cut & Blow Dry", branchId: branchIds.SALON, categoryId: services, salePrice: 150, costPrice: 0, kind: "SERVICE", trackStock: false, unit: "hour", durationMinutes: 60 }),
    await simple({ name: "Full Colour", branchId: branchIds.SALON, categoryId: services, salePrice: 420, costPrice: 90, kind: "SERVICE", trackStock: false, unit: "hour", durationMinutes: 120 }),
    await simple({ name: "Keratin Treatment", branchId: branchIds.SALON, categoryId: services, salePrice: 650, costPrice: 180, kind: "SERVICE", trackStock: false, unit: "hour", durationMinutes: 150 }),
    await simple({ name: "Argan Shampoo 500ml", branchId: branchIds.SALON, categoryId: haircare, salePrice: 85, costPrice: 34 }),
  ];

  return { restaurant, cafe, boutique, salon };
}

/** Opening stock, with one line deliberately under its minimum so the low-stock warnings show. */
async function seedOpeningStock(catalogue: Catalogue, branchIds: Record<string, string>) {
  const plan: { items: Catalogue[keyof Catalogue]; branchId: string }[] = [
    { items: catalogue.restaurant, branchId: branchIds.MAIN },
    { items: catalogue.cafe, branchId: branchIds.CAFE },
    { items: catalogue.boutique, branchId: branchIds.SHOP },
    { items: catalogue.salon, branchId: branchIds.SALON },
  ];

  for (const { items, branchId } of plan) {
    for (const [index, entry] of items.entries()) {
      if (!entry.trackStock) continue;
      // Every fourth line starts low, so "Low stock" is not an empty screen in the demo.
      const quantity = index % 4 === 3 ? 3 : 40 + Math.floor(rand() * 60);
      await db.$transaction((tx) =>
        applyStockMovement(tx, {
          variantId: entry.variantId,
          branchId,
          quantity,
          kind: "OPENING",
          note: "Opening stock",
          userName: "Demo setup",
        }),
      );
    }
  }
}

async function seedRegisters(branchIds: Record<string, string>, cashAccountId: string) {
  const registers: Record<string, string> = {};
  for (const plan of BRANCHES) {
    const register = await db.posRegister.create({
      data: { branchId: branchIds[plan.code], name: `${plan.name} Till`, cashAccountId },
    });
    registers[plan.code] = register.id;
  }
  return registers;
}

/** A floor plan for the restaurant, so the tables screen has something on it. */
async function seedTables(restaurantBranchId: string) {
  const tables = [
    { name: "T1", area: "Main hall", seats: 4 },
    { name: "T2", area: "Main hall", seats: 4 },
    { name: "T3", area: "Main hall", seats: 2 },
    { name: "T4", area: "Terrace", seats: 6 },
    { name: "T5", area: "Terrace", seats: 2 },
    { name: "F1", area: "Family section", seats: 8 },
  ];
  for (const [index, table] of tables.entries()) {
    await db.posTable.create({ data: { ...table, branchId: restaurantBranchId, sortOrder: index } });
  }
}

/**
 * A month of takings, rung up through the real engine.
 *
 * `createSale` moves the stock, writes the payment rows Finance reads and allocates the document
 * number, so what the demo shows on the dashboard, in the reports and on a receipt all agree.
 * Hand-written rows would not.
 */
async function seedTillSales(ctx: {
  branchIds: Record<string, string>;
  registers: Record<string, string>;
  catalogue: Catalogue;
  accounts: { cash: string; bank: string };
  staff: string[];
}) {
  const cashier = await db.user.findFirstOrThrow({ select: { id: true, name: true } });
  // Through the reader, which creates the row lazily — the seed never writes one itself.
  const settings = await getAppSettings();

  /**
   * How often each shop rings something up.
   *
   * Kept deliberately low. Every sale is its own transaction — that is what makes the figures
   * trustworthy — so each one is a round trip, and a seed of several hundred takes long enough
   * that the Reset button stops being usable between meetings. Three weeks at this rate is
   * about sixty sales: enough for the charts to have a shape and the reports to have content,
   * quick enough to rebuild while a salesperson walks to the car.
   */
  const menus: { code: string; items: Catalogue[keyof Catalogue]; everyNDays: number; withStaff?: boolean }[] = [
    { code: "MAIN", items: ctx.catalogue.restaurant, everyNDays: 1 },
    { code: "CAFE", items: ctx.catalogue.cafe, everyNDays: 1 },
    { code: "SHOP", items: ctx.catalogue.boutique, everyNDays: 3 },
    { code: "SALON", items: ctx.catalogue.salon, everyNDays: 2, withStaff: true },
  ];

  for (let day = 21; day >= 0; day--) {
    const date = daysAgo(day);
    for (const menu of menus) {
      if (day % menu.everyNDays !== 0) continue;
      for (let n = 0; n < 1; n++) {
        const lines = Array.from({ length: 1 + Math.floor(rand() * 2) }, () => {
          const entry = pick([...menu.items]);
          return {
            variantId: entry.variantId,
            quantity: 1 + Math.floor(rand() * 2),
            staffId: menu.withStaff ? pick(ctx.staff) : null,
          };
        });

        /**
         * Priced first, then paid exactly.
         *
         * `resolveCart` is the same function `createSale` runs internally, so the amount handed
         * over is the amount the engine will ask for. Working the total out here by hand would
         * be a second implementation of the arithmetic, and the first one to drift.
         */
        const method = rand() > 0.45 ? "CARD" : "CASH";
        try {
          const { totals } = await resolveCart(lines, {
            vatEnabled: settings.vatEnabled,
            defaultVatRate: Number(settings.defaultVatRate),
            cartDiscountPercent: 0,
            branchId: ctx.branchIds[menu.code],
            today: date,
          });

          await createSale({
            branchId: ctx.branchIds[menu.code],
            registerId: ctx.registers[menu.code],
            shiftId: null,
            customerId: null,
            cartDiscountPercent: 0,
            note: null,
            lines,
            payments: [
              { method, paymentAccountId: method === "CASH" ? ctx.accounts.cash : ctx.accounts.bank, amount: totals.grandTotal },
            ],
            park: false,
            cashier,
            today: date,
            vatEnabled: settings.vatEnabled,
            defaultVatRate: Number(settings.defaultVatRate),
          });
        } catch {
          // A line that would take stock below zero is skipped rather than aborting the run:
          // a demo missing one sale is better than a demo that failed to build.
        }
      }
    }
  }
}

/**
 * The Business Management side: who owes what, and to whom.
 *
 * Deliberately includes an overdue invoice and a part-paid one. Receivables, aging, statements
 * and the dashboard's "needs attention" are the screens that win the argument, and all four are
 * blank unless somebody in here is late paying.
 */
async function seedBusinessManagement(accounts: { cash: string; bank: string }) {
  const author = await db.user.findFirstOrThrow({ select: { id: true } });
  const vatRate = 15;

  const customers = await Promise.all(
    [
      { name: "Riyadh Catering Co", type: "COMPANY" as const, vatNumber: "300099887700003", email: "accounts@riyadhcatering.example", phone: "+966 11 111 2222" },
      { name: "Najd Events", type: "COMPANY" as const, vatNumber: "300088776600003", email: "finance@najdevents.example", phone: "+966 11 333 4444" },
      { name: "Sara Al Harbi", type: "INDIVIDUAL" as const, email: "sara@example.com", phone: "+966 55 555 6666" },
    ].map((data) => db.customer.create({ data })),
  );

  const supplier = await db.supplier.create({
    data: { name: "Gulf Food Supplies", type: "COMPANY", vatNumber: "300077665500003", email: "sales@gulffood.example", phone: "+966 11 777 8888" },
  });

  /** One invoice, priced by the same arithmetic the invoice form uses. */
  async function invoice(opts: {
    customerId: string;
    daysOld: number;
    termDays: number;
    lines: { description: string; quantity: number; unitPrice: number }[];
    paid?: number;
    status: "DRAFT" | "SENT";
  }) {
    const items = opts.lines.map((line) => ({ ...line, discountPercent: 0, vatRate }));
    const { rows, totals } = buildItemRows(items);
    const date = daysAgo(opts.daysOld);

    return db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "INVOICE", parseDateOnly(date));
      const created = await tx.invoice.create({
        data: {
          number,
          customerId: opts.customerId,
          date: parseDateOnly(date),
          paymentTermDays: opts.termDays,
          dueDate: parseDateOnly(addDays(date, opts.termDays)),
          ...totals,
          status: opts.status,
          sentAt: opts.status === "SENT" ? parseDateOnly(date) : null,
          createdById: author.id,
          items: { create: rows },
        },
      });
      if (opts.paid && opts.paid > 0) {
        const paymentNumber = await nextDocumentNumber(tx, "PAYMENT", parseDateOnly(addDays(date, 3)));
        await tx.invoicePayment.create({
          data: {
            number: paymentNumber,
            invoiceId: created.id,
            amount: opts.paid,
            date: parseDateOnly(addDays(date, 3)),
            paymentAccountId: accounts.bank,
            createdById: author.id,
          },
        });
        await tx.invoice.update({ where: { id: created.id }, data: { paidTotal: opts.paid } });
      }
      return created;
    });
  }

  // Paid in full.
  await invoice({
    customerId: customers[0].id,
    daysOld: 40,
    termDays: 30,
    status: "SENT",
    lines: [{ description: "Corporate lunch catering — 60 covers", quantity: 60, unitPrice: 75 }],
    paid: 5175,
  });

  // Overdue, which is what lights up aging, receivables and the dashboard.
  await invoice({
    customerId: customers[1].id,
    daysOld: 55,
    termDays: 14,
    status: "SENT",
    lines: [
      { description: "Event catering — canapés", quantity: 120, unitPrice: 28 },
      { description: "Service staff (4 × 6 hours)", quantity: 24, unitPrice: 45 },
    ],
  });

  // Part paid, so "partially paid" is not a status nobody ever sees.
  await invoice({
    customerId: customers[0].id,
    daysOld: 12,
    termDays: 30,
    status: "SENT",
    lines: [{ description: "Weekly office breakfast — March", quantity: 20, unitPrice: 110 }],
    paid: 1000,
  });

  // A draft, to show that a draft is not a tax document and stays out of the VAT return.
  await invoice({
    customerId: customers[2].id,
    daysOld: 2,
    termDays: 14,
    status: "DRAFT",
    lines: [{ description: "Private party — set menu", quantity: 12, unitPrice: 130 }],
  });

  // A received purchase, so stock value, payables and the VAT reclaim all have a source.
  const purchaseLines = [
    { description: "Chicken (20kg cases)", quantity: 8, unitPrice: 210, discountPercent: 0, vatRate },
    { description: "Coffee beans — 1kg", quantity: 15, unitPrice: 95, discountPercent: 0, vatRate },
  ];
  const purchase = buildItemRows(purchaseLines);
  const purchaseDate = daysAgo(18);
  await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "PURCHASE", parseDateOnly(purchaseDate));
    await tx.purchase.create({
      data: {
        number,
        supplierId: supplier.id,
        date: parseDateOnly(purchaseDate),
        paymentTermDays: 30,
        dueDate: parseDateOnly(addDays(purchaseDate, 30)),
        ...purchase.totals,
        receivedAt: parseDateOnly(addDays(purchaseDate, 1)),
        createdById: author.id,
        items: { create: purchase.rows },
      },
    });
  });

  // Running costs, two of them on a tax invoice so the VAT return has something to reclaim.
  const rent = await db.financeCategory.create({ data: { kind: "EXPENSE", name: "Rent" } });
  const utilities = await db.financeCategory.create({ data: { kind: "EXPENSE", name: "Utilities" } });
  const other = await db.financeCategory.create({ data: { kind: "INCOME", name: "Other income" } });

  for (const expense of [
    { categoryId: rent.id, amount: 18000, vatRate: 0, description: "Shop rent — monthly", daysOld: 20 },
    { categoryId: utilities.id, amount: 2415, vatRate: 15, description: "Electricity", daysOld: 15 },
    { categoryId: utilities.id, amount: 920, vatRate: 15, description: "Internet and phone", daysOld: 9 },
  ]) {
    const date = daysAgo(expense.daysOld);
    await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "EXPENSE", parseDateOnly(date));
      await tx.expense.create({
        data: {
          number,
          categoryId: expense.categoryId,
          amount: expense.amount,
          vatRate: expense.vatRate,
          // Expenses are typed VAT-inclusive, so the tax is the part of what was paid.
          vatAmount: expense.vatRate ? Number((expense.amount - expense.amount / (1 + expense.vatRate / 100)).toFixed(2)) : 0,
          date: parseDateOnly(date),
          paymentAccountId: accounts.bank,
          description: expense.description,
          createdById: author.id,
        },
      });
    });
  }

  const incomeDate = daysAgo(7);
  await db.$transaction(async (tx) => {
    const number = await nextDocumentNumber(tx, "INCOME", parseDateOnly(incomeDate));
    await tx.otherIncome.create({
      data: {
        number,
        categoryId: other.id,
        amount: 3500,
        date: parseDateOnly(incomeDate),
        paymentAccountId: accounts.bank,
        description: "Equipment hire to a neighbouring venue",
        createdById: author.id,
      },
    });
  });
}

// ---------------------------------------------------------------------------

export async function resetDemo() {
  await wipeDemo();
  return seedDemo();
}
