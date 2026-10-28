import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { db } from "@/lib/db";
import { dbIt, noDatabase, resetDatabase, startFreshDatabase } from "@/lib/test-support/database";
import { makeAccount, makeCustomer, makeSettings } from "@/lib/test-support/factories";
import { getCustomerStatement } from "@/lib/data/statements";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { parseDateOnly } from "@/lib/dates";

/**
 * The statement, against real rows.
 *
 * The arithmetic is checked without a database next door; this is about **which rows reach it**
 * and with what sign. A draft on a statement chases a customer for money they were never billed,
 * and a refund with the wrong sign tells them they are owed when they owe.
 */

const TODAY = "2026-10-26";
const ALL = { from: null, to: null };

describe("what reaches a customer statement", () => {
  let accountId = "";

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      accountId = (await makeAccount()).id;
    }),
  );

  after(async () => {
    if (await noDatabase()) return;
    await resetDatabase();
  });

  async function invoice(customerId: string, total: number, status: "DRAFT" | "SENT", date = TODAY) {
    return db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "INVOICE", parseDateOnly(date));
      return tx.invoice.create({
        data: {
          number,
          customerId,
          date: parseDateOnly(date),
          paymentTermDays: 30,
          dueDate: parseDateOnly("2026-11-25"),
          subtotal: total,
          vatTotal: 0,
          grandTotal: total,
          status,
          sentAt: status === "SENT" ? new Date() : null,
        },
      });
    });
  }

  async function pay(invoiceId: string, amount: number, date = TODAY) {
    return db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PAYMENT", parseDateOnly(date));
      return tx.invoicePayment.create({
        data: { number, invoiceId, amount, date: parseDateOnly(date), paymentAccountId: accountId },
      });
    });
  }

  dbIt("leaves a draft off, because nobody has been billed for it", async () => {
    const customer = await makeCustomer("Draft Co");
    await invoice(customer.id, 500, "DRAFT");
    const statement = await getCustomerStatement(customer.id, ALL, TODAY);
    assert.deepEqual(statement!.rows, []);
    assert.equal(statement!.closingBalance, 0);
  });

  dbIt("shows what was billed and what was paid, with the balance between them", async () => {
    const customer = await makeCustomer("Running Co");
    const issued = await invoice(customer.id, 1000, "SENT");
    await pay(issued.id, 400);

    const statement = await getCustomerStatement(customer.id, ALL, TODAY);
    assert.equal(statement!.charged, 1000);
    assert.equal(statement!.paid, 400);
    assert.equal(statement!.closingBalance, 600);
    assert.deepEqual(statement!.rows.map((r) => r.kind), ["INVOICE", "PAYMENT"]);
  });

  dbIt("turns a refund back into money owed, which is what the negative row means", async () => {
    // A credit-note refund is a negative payment. Counted as a payment it would halve the debt.
    const customer = await makeCustomer("Refund Co");
    const issued = await invoice(customer.id, 1000, "SENT");
    await pay(issued.id, 1000);
    await pay(issued.id, -250);

    const statement = await getCustomerStatement(customer.id, ALL, TODAY);
    assert.equal(statement!.closingBalance, 250, "they paid 1000 and got 250 back, so they owe 250 again");
  });

  dbIt("opens where the last statement closed", async () => {
    /** Without the brought-forward balance the account looks as though it began this month. */
    const customer = await makeCustomer("Carried Co");
    await invoice(customer.id, 700, "SENT", "2026-08-01");
    await invoice(customer.id, 300, "SENT", "2026-10-10");

    const statement = await getCustomerStatement(customer.id, { from: "2026-10-01", to: "2026-10-31" }, TODAY);
    assert.equal(statement!.openingBalance, 700);
    assert.equal(statement!.rows.length, 1, "only this period's movements are listed");
    assert.equal(statement!.closingBalance, 1000);
  });

  dbIt("never mixes one customer's account into another's", async () => {
    const [mine, theirs] = await Promise.all([makeCustomer("Mine Co"), makeCustomer("Theirs Co")]);
    await invoice(mine.id, 100, "SENT");
    await invoice(theirs.id, 900, "SENT");

    const statement = await getCustomerStatement(mine.id, ALL, TODAY);
    assert.equal(statement!.closingBalance, 100);
  });

  dbIt("says how old the balance is, not just how much", async () => {
    const customer = await makeCustomer("Late Co");
    const old = await invoice(customer.id, 400, "SENT", "2026-05-01");
    await db.invoice.update({ where: { id: old.id }, data: { dueDate: parseDateOnly("2026-05-31"), status: "OVERDUE" } });

    const statement = await getCustomerStatement(customer.id, ALL, TODAY);
    assert.equal(statement!.aging.d90_plus, 400, "owed since May is over 90 days by late October");
    assert.equal(statement!.aging.total, 400);
  });
});
