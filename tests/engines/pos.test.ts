import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { db } from "@/lib/db";
import { dbIt, noDatabase, resetDatabase, startFreshDatabase } from "@/lib/test-support/database";
import { makeAccount, makeBranch, makeProduct, makeSettings, makeUser, stockLevel } from "@/lib/test-support/factories";
import { createSale, type CreateSaleInput } from "@/lib/business/pos";
import { getFinanceTotals } from "@/lib/business/finance";

/**
 * The till, against a real Postgres.
 *
 * These are the invariants the product is sold on: the server prices the sale, the stock moves
 * with the money, and the takings reach Finance by the one path. They cannot be checked without a
 * database — the engine opens its own transaction, locks the numbering row and writes six tables —
 * so a mock here would only be testing the mock.
 */

const DAY = "2026-10-25";
const RANGE = { from: DAY, to: DAY };

describe("createSale", () => {
  let branchId: string;
  let accountId: string;
  let cashier: { id: string; name: string };

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      branchId = (await makeBranch()).id;
      accountId = (await makeAccount()).id;
      const user = await makeUser();
      cashier = { id: user.id, name: user.name };
    }),
  );

  after(async () => {
    if (await noDatabase()) return;
    await resetDatabase();
  });

  /** Everything a sale needs except the part under test. */
  function saleInput(over: Partial<CreateSaleInput> & Pick<CreateSaleInput, "lines">): CreateSaleInput {
    return {
      branchId,
      registerId: null,
      shiftId: null,
      customerId: null,
      cartDiscountPercent: 0,
      note: null,
      payments: [],
      park: true,
      cashier,
      today: DAY,
      vatEnabled: true,
      defaultVatRate: 15,
      ...over,
    };
  }

  dbIt("prices the line itself when the till does not insist", async () => {
    /**
     * The rule the till rests on: a cart says *what* was sold, the server decides what it costs.
     * The line below sends no price at all, and the stored sale still carries the catalogue's.
     */
    const { variant } = await makeProduct({ salePrice: 100, vatRate: 15, branchId, openingStock: 10 });
    const sale = await createSale(saleInput({ lines: [{ variantId: variant.id, quantity: 2 }] }));

    const stored = await db.posSale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    assert.equal(Number(stored.items[0].unitPrice), 100);
    assert.equal(Number(stored.grandTotal), 230);
  });

  dbIt("honours a price the cashier typed, and recomputes the VAT on it", async () => {
    /**
     * `unitPrice` is the manager discount, and it is deliberately allowed to win — but the rest of
     * the line is still the server's: the VAT follows the price actually charged, not the one the
     * till might claim alongside it.
     */
    const { variant } = await makeProduct({ salePrice: 100, vatRate: 15, branchId, openingStock: 10 });
    const sale = await createSale(saleInput({ lines: [{ variantId: variant.id, quantity: 1, unitPrice: 80 }] }));

    const stored = await db.posSale.findUniqueOrThrow({ where: { id: sale.id }, include: { items: true } });
    assert.equal(Number(stored.items[0].unitPrice), 80);
    assert.equal(Number(stored.vatTotal), 12, "VAT follows the discounted price, not the catalogue one");
    assert.equal(Number(stored.grandTotal), 92);
  });

  dbIt("charges VAT on the discounted amount, as the invoice form does", async () => {
    const { variant } = await makeProduct({ salePrice: 100, vatRate: 15, branchId, openingStock: 10 });
    const sale = await createSale(saleInput({ cartDiscountPercent: 10, lines: [{ variantId: variant.id, quantity: 1 }] }));

    // 100 less 10% is 90, so the VAT is 13.50 — not 15.
    const stored = await db.posSale.findUniqueOrThrow({ where: { id: sale.id } });
    assert.equal(Number(stored.vatTotal), 13.5);
    assert.equal(Number(stored.grandTotal), 103.5);
  });

  dbIt("takes its number from the document sequence", async () => {
    const { variant } = await makeProduct({ salePrice: 10, vatRate: 15, branchId, openingStock: 5 });
    const sale = await createSale(saleInput({ lines: [{ variantId: variant.id, quantity: 1 }] }));
    assert.match(sale.number, /^POS-/);
  });

  dbIt("holds a parked sale without moving stock or taking money", async () => {
    // A held bill has not happened yet: nothing leaves the shelf and no money is recorded.
    const { variant } = await makeProduct({ salePrice: 50, vatRate: 15, branchId, openingStock: 8 });
    const sale = await createSale(saleInput({ lines: [{ variantId: variant.id, quantity: 3 }] }));

    assert.equal(await stockLevel(variant.id, branchId), 8);
    assert.equal(await db.posPayment.count({ where: { saleId: sale.id } }), 0);
    assert.equal((await db.posSale.findUniqueOrThrow({ where: { id: sale.id } })).status, "PARKED");
  });

  describe("completing a sale", () => {
    dbIt("moves the stock, records the money, and reaches Finance by the one path", async () => {
      const { variant } = await makeProduct({ salePrice: 100, costPrice: 60, vatRate: 15, branchId, openingStock: 10 });
      const before = await getFinanceTotals(RANGE);

      const sale = await createSale(
        saleInput({
          park: false,
          lines: [{ variantId: variant.id, quantity: 2 }],
          payments: [{ method: "CASH", paymentAccountId: accountId, amount: 230 }],
        }),
      );

      assert.equal(await stockLevel(variant.id, branchId), 8, "two left the shelf");
      const stored = await db.posSale.findUniqueOrThrow({ where: { id: sale.id }, include: { payments: true, items: true } });
      assert.equal(stored.status, "COMPLETED");
      assert.equal(Number(stored.payments[0].amount), 230);
      // The unit cost is snapshotted, so margin survives a later change to the catalogue.
      assert.equal(Number(stored.items[0].unitCost), 60);

      const after = await getFinanceTotals(RANGE);
      assert.equal(after.posSales - before.posSales, 230, "POS takings are income, with no second set of figures");
    });

    dbIt("writes the stock movement that explains the new quantity", async () => {
      // The level and the movement are written together, so every quantity can be traced.
      const { variant } = await makeProduct({ salePrice: 20, vatRate: 15, branchId, openingStock: 5 });
      await createSale(
        saleInput({
          park: false,
          lines: [{ variantId: variant.id, quantity: 1 }],
          payments: [{ method: "CASH", paymentAccountId: accountId, amount: 23 }],
        }),
      );

      const movement = await db.stockMovement.findFirstOrThrow({ where: { variantId: variant.id, kind: "SALE" } });
      assert.equal(Number(movement.quantity), -1);
    });

    dbIt("refuses stock that is not there, and leaves nothing behind", async () => {
      /**
       * The refusal has to roll the whole sale back. A sale recorded against stock that does not
       * exist is worse than a refused one, because the shortfall is then invisible.
       */
      const { variant } = await makeProduct({ salePrice: 10, vatRate: 15, branchId, openingStock: 1 });
      const salesBefore = await db.posSale.count();

      await assert.rejects(
        createSale(
          saleInput({
            park: false,
            lines: [{ variantId: variant.id, quantity: 5 }],
            payments: [{ method: "CASH", paymentAccountId: accountId, amount: 57.5 }],
          }),
        ),
      );

      assert.equal(await db.posSale.count(), salesBefore, "no sale was left behind");
      assert.equal(await stockLevel(variant.id, branchId), 1, "the stock is untouched");
    });

    dbIt("refuses a payment that does not cover the sale", async () => {
      const { variant } = await makeProduct({ salePrice: 100, vatRate: 15, branchId, openingStock: 5 });
      await assert.rejects(
        createSale(
          saleInput({
            park: false,
            lines: [{ variantId: variant.id, quantity: 1 }],
            payments: [{ method: "CASH", paymentAccountId: accountId, amount: 50 }],
          }),
        ),
      );
    });

    dbIt("records a replayed offline sale once, however many times it is sent", async () => {
      /**
       * The whole safety of offline selling. A connection that drops *after* the server committed
       * leaves the till believing it failed, so the queue sends again. Without the client's own
       * reference as a key, that second send would ring the sale up twice: money invented and
       * stock gone, with nothing to show which was real.
       */
      const { variant } = await makeProduct({ salePrice: 100, vatRate: 15, branchId, openingStock: 10 });
      const reference = `off_test_${Date.now()}`;
      const payload = saleInput({
        park: false,
        clientReference: reference,
        lines: [{ variantId: variant.id, quantity: 1 }],
        payments: [{ method: "CASH", paymentAccountId: accountId, amount: 115 }],
      });

      const first = await createSale(payload);
      const second = await createSale(payload);

      assert.equal(second.id, first.id, "the replay made a second sale");
      assert.equal(second.number, first.number);
      assert.equal(second.alreadyRecorded, true, "the second send should say it was already recorded");
      assert.equal(first.alreadyRecorded, false);
      assert.equal(await db.posSale.count({ where: { clientReference: reference } }), 1);
      assert.equal(await stockLevel(variant.id, branchId), 9, "the stock moved once, not twice");
    });

    dbIt("still records two genuinely separate sales of the same thing", async () => {
      // The guard keys on the reference, so two real sales must not be mistaken for a repeat.
      const { variant } = await makeProduct({ salePrice: 100, vatRate: 15, branchId, openingStock: 10 });
      const line = { variantId: variant.id, quantity: 1 };
      const payments = [{ method: "CASH" as const, paymentAccountId: accountId, amount: 115 }];

      const a = await createSale(saleInput({ park: false, clientReference: `off_a_${Date.now()}`, lines: [line], payments }));
      const b = await createSale(saleInput({ park: false, clientReference: `off_b_${Date.now()}`, lines: [line], payments }));

      assert.notEqual(a.id, b.id);
      assert.equal(await stockLevel(variant.id, branchId), 8);
    });

    dbIt("gives every sale its own number under concurrency", async () => {
      /**
       * Numbering locks its sequence row `FOR UPDATE`. Two tills ringing up at once is the case
       * that lock exists for, and a duplicate document number is the kind of fault nobody notices
       * until an auditor does.
       */
      const { variant } = await makeProduct({ salePrice: 10, vatRate: 15, branchId, openingStock: 50 });
      const sales = await Promise.all(
        Array.from({ length: 5 }, () =>
          createSale(
            saleInput({
              park: false,
              lines: [{ variantId: variant.id, quantity: 1 }],
              payments: [{ method: "CASH", paymentAccountId: accountId, amount: 11.5 }],
            }),
          ),
        ),
      );
      const numbers = sales.map((s) => s.number);
      assert.equal(new Set(numbers).size, numbers.length, `duplicate sale number: ${numbers.join(", ")}`);
    });
  });
});
