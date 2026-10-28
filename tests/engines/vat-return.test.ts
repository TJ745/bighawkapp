import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { db } from "@/lib/db";
import { dbIt, noDatabase, resetDatabase, startFreshDatabase } from "@/lib/test-support/database";
import { makeAccount, makeCustomer, makeSettings, makeSupplier } from "@/lib/test-support/factories";
import { getVatReturn } from "@/lib/business/vat-return";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { parseDateOnly } from "@/lib/dates";

/**
 * Which documents reach the VAT return.
 *
 * The arithmetic is checked next door without a database; this is about the **filters**, and they
 * are the part that matters legally. A draft invoice on a return overstates what is owed to
 * ZATCA; a purchase that has not arrived understates it. Both look like perfectly ordinary
 * numbers on screen.
 */

const DAY = "2026-10-26";
/** Halalas, so a float comparison does not fail on a rounding tail. */
const round = (value: number) => Math.round(value * 100) / 100;
const RANGE = { from: DAY, to: DAY };

describe("what reaches the VAT return", () => {
  let accountId = "";
  let categoryId = "";

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      accountId = (await makeAccount()).id;
      categoryId = (await db.financeCategory.create({ data: { kind: "EXPENSE", name: "Rent" } })).id;
    }),
  );

  after(async () => {
    if (await noDatabase()) return;
    await resetDatabase();
  });

  /** An invoice at `net` + 15%, in whatever state. */
  async function invoice(net: number, status: "DRAFT" | "SENT") {
    const customer = await makeCustomer(`C${Math.random().toString(36).slice(2, 7)}`);
    return db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "INVOICE", parseDateOnly(DAY));
      return tx.invoice.create({
        data: {
          number,
          customerId: customer.id,
          date: parseDateOnly(DAY),
          paymentTermDays: 30,
          dueDate: parseDateOnly("2026-11-25"),
          subtotal: net,
          vatTotal: net * 0.15,
          grandTotal: net * 1.15,
          status,
          sentAt: status === "SENT" ? new Date() : null,
        },
      });
    });
  }

  /** A purchase at `net` + 15%, received or not. */
  async function purchase(net: number, received: boolean) {
    const supplier = await makeSupplier(`S${Math.random().toString(36).slice(2, 7)}`);
    return db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PURCHASE", parseDateOnly(DAY));
      return tx.purchase.create({
        data: {
          number,
          supplierId: supplier.id,
          date: parseDateOnly(DAY),
          paymentTermDays: 30,
          dueDate: parseDateOnly("2026-11-25"),
          subtotal: net,
          vatTotal: net * 0.15,
          grandTotal: net * 1.15,
          status: received ? "UNPAID" : "DRAFT",
          receivedAt: received ? new Date() : null,
        },
      });
    });
  }

  dbIt("leaves out a draft invoice, which is not a tax document", async () => {
    // Counting it would mean paying ZATCA for a sale nobody has been told about.
    await invoice(1000, "DRAFT");
    const before = await getVatReturn(RANGE);
    assert.equal(before.sales.vat, 0);

    await invoice(1000, "SENT");
    const after = await getVatReturn(RANGE);
    assert.equal(after.sales.vat, 150);
    assert.equal(after.sales.standardRatedNet, 1000);
  });

  dbIt("leaves out a purchase that has not arrived", async () => {
    // Input VAT is reclaimable on what was actually supplied, not on what was ordered.
    await purchase(400, false);
    assert.equal((await getVatReturn(RANGE)).purchases.vat, 0);

    await purchase(400, true);
    assert.equal((await getVatReturn(RANGE)).purchases.vat, 60);
  });

  dbIt("reclaims VAT on an expense that had a tax invoice, and nothing on one that did not", async () => {
    /**
     * Expenses carried no VAT at all until this existed, so every quarter's reclaim was short by
     * the tax on every rent, courier and fee the business paid.
     */
    const spend = async (amount: number, vatAmount: number) =>
      db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, "EXPENSE", parseDateOnly(DAY));
        return tx.expense.create({
          data: {
            number,
            categoryId,
            amount,
            vatRate: vatAmount > 0 ? 15 : 0,
            vatAmount,
            date: parseDateOnly(DAY),
            paymentAccountId: accountId,
          },
        });
      });

    const before = await getVatReturn(RANGE);
    await spend(500, 0);
    assert.equal((await getVatReturn(RANGE)).purchases.vat, before.purchases.vat, "no tax invoice, nothing to reclaim");

    await spend(1150, 150);
    const after = await getVatReturn(RANGE);
    assert.equal(round(after.purchases.vat - before.purchases.vat), 150);
    // The base is what is left after the tax: 1150 paid, 150 of it VAT, 1000 of spending.
    assert.equal(round(after.purchases.standardRatedNet - before.purchases.standardRatedNet), 1000);
  });

  dbIt("nets a credit note off the sales it put right", async () => {
    const issued = await invoice(1000, "SENT");
    const before = await getVatReturn(RANGE);

    await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "CREDIT_NOTE", parseDateOnly(DAY));
      await tx.creditNote.create({
        data: {
          number,
          invoiceId: issued.id,
          customerId: issued.customerId,
          date: parseDateOnly(DAY),
          reason: "Returned",
          subtotal: 200,
          discountTotal: 0,
          vatTotal: 30,
          grandTotal: 230,
          createdByName: "Test",
        },
      });
    });

    const after = await getVatReturn(RANGE);
    assert.equal(before.sales.vat - after.sales.vat, 30, "a credit reduces what is owed");
    assert.equal(after.sales.adjustmentsVat, 30);
  });

  dbIt("answers with the difference, and says which way it goes", async () => {
    // Measured as a change, because the tests in this file share one database by design.
    const before = await getVatReturn(RANGE);
    await invoice(1000, "SENT");
    await purchase(400, true);
    const after = await getVatReturn(RANGE);
    // 150 charged out, 60 paid in: 90 more owed to ZATCA than before.
    assert.equal(round(after.netVat - before.netVat), 90);

    await purchase(100_000, true);
    const reclaim = await getVatReturn(RANGE);
    assert.ok(reclaim.netVat < 0, "more VAT paid than charged is reclaimable, not a negative debt");
  });

  dbIt("shows every source it counted, so the total can be followed", async () => {
    const before = await getVatReturn(RANGE);
    const invoicesBefore = before.sources.find((source) => source.label === "Invoices")!;
    await invoice(1000, "SENT");

    const after = await getVatReturn(RANGE);
    const invoices = after.sources.find((source) => source.label === "Invoices")!;
    assert.equal(invoices.documents - invoicesBefore.documents, 1);
    assert.equal(round(invoices.vat - invoicesBefore.vat), 150);
    // Credits are always listed, even at zero, so a reader can see they were considered.
    assert.ok(
      after.sources.some((source) => source.label === "Credit notes"),
      "credit notes should be listed whether or not there were any",
    );
    // And the sources add up to the headline figure, which is the point of showing them.
    const salesVat = after.sources
      .filter((source) => ["Invoices", "POS sales", "Credit notes", "POS returns"].includes(source.label))
      .reduce((total, source) => total + source.vat, 0);
    assert.equal(round(salesVat), after.sales.vat);
  });
});
