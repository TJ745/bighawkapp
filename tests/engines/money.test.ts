import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { db } from "@/lib/db";
import { dbIt, noDatabase, resetDatabase, startFreshDatabase } from "@/lib/test-support/database";
import { makeAccount, makeBranch, makeCustomer, makeProduct, makeSettings, makeSupplier, makeUser, stockLevel } from "@/lib/test-support/factories";
import { createSale } from "@/lib/business/pos";
import { createReturn } from "@/lib/business/pos-returns";
import { applyAdvance, refundAdvance, takeAdvance } from "@/lib/business/advances";
import { applySupplierAdvance, paySupplierAdvance, refundSupplierAdvance } from "@/lib/business/supplier-advances";
import { getAccountBalances, getFinanceTotals } from "@/lib/business/finance";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { parseDateOnly } from "@/lib/dates";

/**
 * Money leaving, and money arriving before it is owed.
 *
 * Both are places where a plausible-looking change silently counts a riyal twice or loses one.
 * They are checked against a real database for the same reason the till is: the invariants live
 * across several tables and a transaction, not inside one function.
 */

const DAY = "2026-10-25";
const RANGE = { from: DAY, to: DAY };

describe("money that moves back out", () => {
  let branchId: string;
  let accountId: string;
  let user: { id: string; name: string };

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      branchId = (await makeBranch()).id;
      accountId = (await makeAccount()).id;
      const u = await makeUser();
      user = { id: u.id, name: u.name };
    }),
  );

  after(async () => {
    if (await noDatabase()) return;
    await resetDatabase();
  });

  /** A completed sale of `quantity` at 100 + 15% VAT, paid in cash. */
  async function soldSale(quantity: number, openingStock = 10) {
    const { variant } = await makeProduct({ salePrice: 100, costPrice: 60, vatRate: 15, branchId, openingStock });
    const total = Number((quantity * 115).toFixed(2));
    const sale = await createSale({
      branchId,
      registerId: null,
      shiftId: null,
      customerId: null,
      cartDiscountPercent: 0,
      note: null,
      lines: [{ variantId: variant.id, quantity }],
      payments: [{ method: "CASH", paymentAccountId: accountId, amount: total }],
      park: false,
      cashier: user,
      today: DAY,
      vatEnabled: true,
      defaultVatRate: 15,
    });
    const stored = await db.posSale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    return { variant, sale: stored, total };
  }

  describe("returns", () => {
    dbIt("refunds through a negative payment, so Finance nets out by itself", async () => {
      /**
       * Money out uses the rows money came in on. If a refund were its own kind of record, every
       * report would need to learn about it separately — and one of them would be forgotten.
       */
      const { sale } = await soldSale(2);
      const before = await getFinanceTotals(RANGE);

      await createReturn({
        saleId: sale.id,
        lines: [{ saleItemId: sale.items[0].id, quantity: 1 }],
        refunds: [{ method: "CASH", paymentAccountId: accountId, amount: 115 }],
        reason: "changed their mind",
        restock: true,
        registerId: null,
        shiftId: null,
        user,
        today: DAY,
      });

      const after = await getFinanceTotals(RANGE);
      assert.equal(before.posSales - after.posSales, 115, "the refund came straight back out of takings");
      const negative = await db.posPayment.findFirst({ where: { saleId: sale.id, amount: { lt: 0 } } });
      assert.ok(negative, "the refund is a negative payment row, not a separate kind of record");
    });

    dbIt("puts returned goods back on the shelf", async () => {
      const { variant, sale } = await soldSale(3, 10);
      assert.equal(await stockLevel(variant.id, branchId), 7);

      await createReturn({
        saleId: sale.id,
        lines: [{ saleItemId: sale.items[0].id, quantity: 2 }],
        refunds: [{ method: "CASH", paymentAccountId: accountId, amount: 230 }],
        reason: "wrong size",
        restock: true,
        registerId: null,
        shiftId: null,
        user,
        today: DAY,
      });

      assert.equal(await stockLevel(variant.id, branchId), 9, "two came back");
    });

    dbIt("writes damaged goods off without putting them back", async () => {
      // A write-off still refunds the customer; it just does not pretend the goods are saleable.
      const { variant, sale } = await soldSale(2, 10);
      assert.equal(await stockLevel(variant.id, branchId), 8);

      await createReturn({
        saleId: sale.id,
        lines: [{ saleItemId: sale.items[0].id, quantity: 1 }],
        refunds: [{ method: "CASH", paymentAccountId: accountId, amount: 115 }],
        reason: "damaged",
        restock: false,
        registerId: null,
        shiftId: null,
        user,
        today: DAY,
      });

      assert.equal(await stockLevel(variant.id, branchId), 8, "a write-off leaves the shelf alone");
      const negative = await db.posPayment.findFirst({ where: { saleId: sale.id, amount: { lt: 0 } } });
      assert.ok(negative, "but the customer is still refunded");
    });

    dbIt("will not return more than was sold, however many goes it takes", async () => {
      /** `returnedQuantity` is the cap, so two partial returns cannot exceed the line. */
      const { sale } = await soldSale(2);
      const line = { saleItemId: sale.items[0].id, quantity: 1 };
      const refunds = [{ method: "CASH" as const, paymentAccountId: accountId, amount: 115 }];

      await createReturn({ saleId: sale.id, lines: [line], refunds, reason: "one back", restock: true, registerId: null, shiftId: null, user, today: DAY });
      await createReturn({ saleId: sale.id, lines: [line], refunds, reason: "the other", restock: true, registerId: null, shiftId: null, user, today: DAY });

      await assert.rejects(
        createReturn({ saleId: sale.id, lines: [line], refunds, reason: "a third", restock: true, registerId: null, shiftId: null, user, today: DAY }),
        "returning a third of two was allowed",
      );
    });

    dbIt("insists the refund matches what is being returned", async () => {
      // Refunding more than the goods are worth is how a till is robbed politely.
      const { sale } = await soldSale(1);
      await assert.rejects(
        createReturn({
          saleId: sale.id,
          lines: [{ saleItemId: sale.items[0].id, quantity: 1 }],
          refunds: [{ method: "CASH", paymentAccountId: accountId, amount: 500 }],
          reason: "too much",
          restock: true,
          registerId: null,
          shiftId: null,
          user,
          today: DAY,
        }),
      );
    });

    dbIt("marks the sale refunded only when all of it has come back", async () => {
      const { sale } = await soldSale(2);
      const line = { saleItemId: sale.items[0].id, quantity: 1 };
      const refunds = [{ method: "CASH" as const, paymentAccountId: accountId, amount: 115 }];

      await createReturn({ saleId: sale.id, lines: [line], refunds, reason: "one", restock: true, registerId: null, shiftId: null, user, today: DAY });
      assert.equal((await db.posSale.findUniqueOrThrow({ where: { id: sale.id } })).status, "PARTIALLY_REFUNDED");

      await createReturn({ saleId: sale.id, lines: [line], refunds, reason: "two", restock: true, registerId: null, shiftId: null, user, today: DAY });
      assert.equal((await db.posSale.findUniqueOrThrow({ where: { id: sale.id } })).status, "REFUNDED");
    });
  });

  describe("customer advances", () => {
    /** An issued invoice for `total`, so an advance has something to settle. */
    async function issuedInvoice(customerId: string, total: number) {
      return db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, "INVOICE", parseDateOnly(DAY));
        return tx.invoice.create({
          data: {
            number,
            customerId,
            date: parseDateOnly(DAY),
            paymentTermDays: 30,
            dueDate: parseDateOnly("2026-11-24"),
            subtotal: total,
            vatTotal: 0,
            grandTotal: total,
            status: "SENT",
            sentAt: new Date(),
          },
          select: { id: true, number: true },
        });
      });
    }

    dbIt("counts the cash once: on the advance, never again when it settles an invoice", async () => {
      /**
       * The invariant the whole feature rests on. Applying an advance moves no money — it only
       * decides what the money already banked is for. Counting it again would show the same riyal
       * as income twice and overstate the bank by every deposit ever taken.
       */
      const customer = await makeCustomer("Advance Co");
      const invoice = await issuedInvoice(customer.id, 1000);
      const before = await getFinanceTotals(RANGE);
      const bankBefore = (await getAccountBalances()).find((a) => a.id === accountId)?.balance ?? 0;

      const advance = await takeAdvance({
        customerId: customer.id,
        amount: 1000,
        date: DAY,
        paymentAccountId: accountId,
        reference: null,
        notes: null,
        user,
      });

      const afterTaking = await getFinanceTotals(RANGE);
      assert.equal(afterTaking.customerPayments - before.customerPayments, 1000, "the advance is the money-in event");

      await applyAdvance({ advanceId: advance.id, invoiceId: invoice.id, amount: 400, date: DAY, user });

      const afterApplying = await getFinanceTotals(RANGE);
      const bankAfter = (await getAccountBalances()).find((a) => a.id === accountId)?.balance ?? 0;
      assert.equal(afterApplying.customerPayments, afterTaking.customerPayments, "applying it must not add income a second time");
      assert.equal(bankAfter - bankBefore, 1000, "nor move the bank balance again");

      const settled = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      assert.equal(Number(settled.paidTotal), 400, "the invoice really is paid by that money");
      assert.equal(settled.status, "PARTIALLY_PAID");
    });

    dbIt("takes money back out on the day it is handed back", async () => {
      // Cash-based: money in one month and out the next is two events, not a smaller one.
      const customer = await makeCustomer("Refund Co");
      const advance = await takeAdvance({ customerId: customer.id, amount: 500, date: DAY, paymentAccountId: accountId, reference: null, notes: null, user });
      const before = await getFinanceTotals(RANGE);

      await refundAdvance({ advanceId: advance.id, amount: 200, date: DAY, paymentAccountId: accountId, reference: null, user });

      const after = await getFinanceTotals(RANGE);
      assert.equal(before.customerPayments - after.customerPayments, 200);
    });

    dbIt("will not let one customer's deposit settle another's bill", async () => {
      /** Without this the feature would be a way of moving balances between customers. */
      const [alpha, beta] = await Promise.all([makeCustomer("Alpha"), makeCustomer("Beta")]);
      const theirInvoice = await issuedInvoice(beta.id, 300);
      const advance = await takeAdvance({ customerId: alpha.id, amount: 300, date: DAY, paymentAccountId: accountId, reference: null, notes: null, user });

      await assert.rejects(applyAdvance({ advanceId: advance.id, invoiceId: theirInvoice.id, amount: 100, date: DAY, user }));
    });

    dbIt("will not spend more of an advance than is left on it", async () => {
      const customer = await makeCustomer("Careful Co");
      const invoice = await issuedInvoice(customer.id, 1000);
      const advance = await takeAdvance({ customerId: customer.id, amount: 100, date: DAY, paymentAccountId: accountId, reference: null, notes: null, user });

      await applyAdvance({ advanceId: advance.id, invoiceId: invoice.id, amount: 100, date: DAY, user });
      await assert.rejects(applyAdvance({ advanceId: advance.id, invoiceId: invoice.id, amount: 1, date: DAY, user }));
    });
  });

  describe("supplier prepayments", () => {
    /** A confirmed purchase for `total`, so a prepayment has something to settle. */
    async function confirmedPurchase(supplierId: string, total: number) {
      return db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, "PURCHASE", parseDateOnly(DAY));
        return tx.purchase.create({
          data: {
            number,
            supplierId,
            date: parseDateOnly(DAY),
            paymentTermDays: 30,
            dueDate: parseDateOnly("2026-11-24"),
            subtotal: total,
            vatTotal: 0,
            grandTotal: total,
            status: "UNPAID",
          },
          select: { id: true, number: true },
        });
      });
    }

    dbIt("counts the cash once: on the prepayment, never again when it settles a purchase", async () => {
      /**
       * The mirror of the customer invariant, and the one the whole feature rests on. Applying a
       * prepayment moves no money — it only decides which bill the money already paid is for.
       * Counting it again would show the same riyal as an expense twice and understate the bank
       * by every deposit ever paid.
       */
      const supplier = await makeSupplier("Prepay Co");
      const purchase = await confirmedPurchase(supplier.id, 1000);
      const before = await getFinanceTotals(RANGE);
      const bankBefore = (await getAccountBalances()).find((a) => a.id === accountId)?.balance ?? 0;

      const advance = await paySupplierAdvance({
        supplierId: supplier.id,
        amount: 1000,
        date: DAY,
        paymentAccountId: accountId,
        reference: null,
        notes: null,
        user,
      });

      const afterPaying = await getFinanceTotals(RANGE);
      assert.equal(afterPaying.supplierPayments - before.supplierPayments, 1000, "the prepayment is the money-out event");

      await applySupplierAdvance({ advanceId: advance.id, purchaseId: purchase.id, amount: 400, date: DAY, user });

      const afterApplying = await getFinanceTotals(RANGE);
      const bankAfter = (await getAccountBalances()).find((a) => a.id === accountId)?.balance ?? 0;
      assert.equal(afterApplying.supplierPayments, afterPaying.supplierPayments, "applying it must not spend a second time");
      assert.equal(bankBefore - bankAfter, 1000, "nor move the bank balance again");

      const settled = await db.purchase.findUniqueOrThrow({ where: { id: purchase.id } });
      assert.equal(Number(settled.paidTotal), 400, "the purchase really is paid by that money");
      assert.equal(settled.status, "PARTIALLY_PAID");
    });

    dbIt("brings money back in on the day the supplier returns it", async () => {
      // Cash-based: money out in one month and back in the next is two events, not a smaller one.
      const supplier = await makeSupplier("Returns Co");
      const advance = await paySupplierAdvance({
        supplierId: supplier.id,
        amount: 500,
        date: DAY,
        paymentAccountId: accountId,
        reference: null,
        notes: null,
        user,
      });
      const before = await getFinanceTotals(RANGE);

      await refundSupplierAdvance({ advanceId: advance.id, amount: 200, date: DAY, paymentAccountId: accountId, reference: null, user });

      const after = await getFinanceTotals(RANGE);
      assert.equal(before.supplierPayments - after.supplierPayments, 200);
    });

    dbIt("will not let one supplier's deposit settle another's bill", async () => {
      /** Without this the feature would be a way of moving balances between suppliers. */
      const [alpha, beta] = await Promise.all([makeSupplier("Alpha Supplies"), makeSupplier("Beta Supplies")]);
      const theirPurchase = await confirmedPurchase(beta.id, 300);
      const advance = await paySupplierAdvance({
        supplierId: alpha.id,
        amount: 300,
        date: DAY,
        paymentAccountId: accountId,
        reference: null,
        notes: null,
        user,
      });

      await assert.rejects(applySupplierAdvance({ advanceId: advance.id, purchaseId: theirPurchase.id, amount: 100, date: DAY, user }));
    });

    dbIt("will not spend more of a prepayment than is left on it", async () => {
      const supplier = await makeSupplier("Careful Supplies");
      const purchase = await confirmedPurchase(supplier.id, 1000);
      const advance = await paySupplierAdvance({
        supplierId: supplier.id,
        amount: 100,
        date: DAY,
        paymentAccountId: accountId,
        reference: null,
        notes: null,
        user,
      });

      await applySupplierAdvance({ advanceId: advance.id, purchaseId: purchase.id, amount: 100, date: DAY, user });
      await assert.rejects(applySupplierAdvance({ advanceId: advance.id, purchaseId: purchase.id, amount: 1, date: DAY, user }));
    });
  });
});
