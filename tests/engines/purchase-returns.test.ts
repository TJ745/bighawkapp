import assert from "node:assert/strict";
import { after, before, describe } from "node:test";
import { db } from "@/lib/db";
import { dbIt, noDatabase, resetDatabase, startFreshDatabase } from "@/lib/test-support/database";
import { makeAccount, makeBranch, makeProduct, makeSettings, makeSupplier, makeUser, stockLevel } from "@/lib/test-support/factories";
import { createPurchaseReturn, cancelPurchaseReturn } from "@/lib/business/purchase-returns";
import { receiveGoods } from "@/lib/business/receiving";
import { getFinanceTotals, listPayables } from "@/lib/business/finance";
import { nextDocumentNumber } from "@/lib/business/numbering";
import { parseDateOnly } from "@/lib/dates";

/**
 * Goods going back to a supplier.
 *
 * The one place in the app that writes a `PURCHASE_RETURN` stock movement, and the only feature
 * where a single action has to move **stock and money at once** in opposite directions — the
 * shelf goes down, the bill goes down, and the bank only moves if the supplier actually sends
 * something back. None of that can be checked without a database.
 */

const DAY = "2026-10-26";
const RANGE = { from: DAY, to: DAY };

describe("sending goods back to a supplier", () => {
  let branchId = "";
  let accountId = "";
  let user: { id: string; name: string };

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      branchId = (await makeBranch()).id;
      accountId = (await makeAccount()).id;
      const person = await makeUser("Storekeeper");
      user = { id: person.id, name: person.name };
    }),
  );

  after(async () => {
    if (await noDatabase()) return;
    await resetDatabase();
  });

  /** A purchase of `quantity` widgets at 100 + 15% VAT, received into the branch. */
  async function receivedPurchase(options: { quantity?: number; paid?: number } = {}) {
    const quantity = options.quantity ?? 10;
    const supplier = await makeSupplier(`Supplies ${Math.random().toString(36).slice(2, 7)}`);
    const product = await makeProduct({ name: "Widget", salePrice: 200, openingStock: 0, branchId });

    const purchase = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PURCHASE", parseDateOnly(DAY));
      return tx.purchase.create({
        data: {
          number,
          supplierId: supplier.id,
          date: parseDateOnly(DAY),
          paymentTermDays: 30,
          dueDate: parseDateOnly("2026-11-25"),
          subtotal: quantity * 100,
          vatTotal: quantity * 15,
          grandTotal: quantity * 115,
          status: "UNPAID",
          supplierReference: "SI-1",
          items: {
            create: [
              {
                sortOrder: 0,
                description: "Widget",
                quantity,
                unitPrice: 100,
                vatRate: 15,
                lineSubtotal: quantity * 100,
                lineDiscount: 0,
                lineVat: quantity * 15,
                lineTotal: quantity * 115,
              },
            ],
          },
        },
        include: { items: true },
      });
    });

    await receiveGoods({
      purchaseId: purchase.id,
      branchId,
      date: DAY,
      lines: [{ purchaseItemId: purchase.items[0].id, variantId: product.variant.id, quantity }],
      note: null,
      updateCostPrice: false,
      user,
    });

    if (options.paid) {
      await db.$transaction(async (tx) => {
        const number = await nextDocumentNumber(tx, "PAYMENT", parseDateOnly(DAY));
        await tx.purchasePayment.create({
          data: { number, purchaseId: purchase.id, amount: options.paid!, date: parseDateOnly(DAY), paymentAccountId: accountId },
        });
        const { refreshPurchase } = await import("@/lib/business/procurement");
        await refreshPurchase(tx, purchase.id);
      });
    }

    return { supplier, purchase, variantId: product.variant.id, itemId: purchase.items[0].id };
  }

  dbIt("takes the goods off the shelf and the money off the bill", async () => {
    const { purchase, variantId, itemId } = await receivedPurchase({ quantity: 10 });
    assert.equal(await stockLevel(variantId, branchId), 10, "the delivery should be on the shelf first");

    const result = await createPurchaseReturn({
      purchaseId: purchase.id,
      branchId,
      lines: [{ purchaseItemId: itemId, quantity: 4 }],
      reason: "Damaged in transit",
      date: DAY,
      internalNotes: null,
      refund: null,
      user,
    });

    assert.equal(await stockLevel(variantId, branchId), 6);
    // Recomputed from the purchase's own line, not apportioned: 4 × 100 + 15% = 460.
    assert.equal(result.grandTotal, 460);
    assert.equal(Number(result.purchase.creditedTotal), 460);
    assert.equal(result.purchase.status, "UNPAID", "still owed for the six that stayed");
  });

  dbIt("writes the movement that explains the new quantity", async () => {
    // The kind matters: calling it an ADJUSTMENT would lose why the stock went.
    const { purchase, variantId, itemId } = await receivedPurchase({ quantity: 5 });
    await createPurchaseReturn({
      purchaseId: purchase.id,
      branchId,
      lines: [{ purchaseItemId: itemId, quantity: 2 }],
      reason: "Wrong colour",
      date: DAY,
      internalNotes: null,
      refund: null,
      user,
    });

    const movement = await db.stockMovement.findFirst({
      where: { variantId, branchId, kind: "PURCHASE_RETURN" },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(movement, "a PURCHASE_RETURN movement should exist");
    assert.equal(Number(movement.quantity), -2);
  });

  dbIt("refuses to send back more than ever arrived", async () => {
    /** Returning what never turned up would take stock off a shelf it was never on. */
    const { purchase, itemId } = await receivedPurchase({ quantity: 3 });
    await assert.rejects(
      createPurchaseReturn({
        purchaseId: purchase.id,
        branchId,
        lines: [{ purchaseItemId: itemId, quantity: 4 }],
        reason: "Too many",
        date: DAY,
        internalNotes: null,
        refund: null,
        user,
      }),
      /Only 3/,
    );
  });

  dbIt("caps the total across several returns, and leaves nothing behind when it refuses", async () => {
    const { purchase, variantId, itemId } = await receivedPurchase({ quantity: 6 });
    await createPurchaseReturn({
      purchaseId: purchase.id,
      branchId,
      lines: [{ purchaseItemId: itemId, quantity: 4 }],
      reason: "First batch",
      date: DAY,
      internalNotes: null,
      refund: null,
      user,
    });
    await assert.rejects(
      createPurchaseReturn({
        purchaseId: purchase.id,
        branchId,
        lines: [{ purchaseItemId: itemId, quantity: 3 }],
        reason: "Too many",
        date: DAY,
        internalNotes: null,
        refund: null,
        user,
      }),
    );
    // The refusal must not have moved anything: 6 arrived, 4 went back, 2 left.
    assert.equal(await stockLevel(variantId, branchId), 2);
    assert.equal(await db.purchaseReturn.count({ where: { purchaseId: purchase.id } }), 1);
  });

  dbIt("reads Credited, not Paid, when the whole bill went back unpaid", async () => {
    const { purchase, itemId } = await receivedPurchase({ quantity: 2 });
    const result = await createPurchaseReturn({
      purchaseId: purchase.id,
      branchId,
      lines: [{ purchaseItemId: itemId, quantity: 2 }],
      reason: "All of it",
      date: DAY,
      internalNotes: null,
      refund: null,
      user,
    });
    assert.equal(result.purchase.status, "CREDITED");

    // And it stops being money the business owes.
    const payable = (await listPayables({ from: "2020-01-01", to: "2030-12-31" }, {})).find((row) => row.number === purchase.number);
    assert.equal(payable, undefined, "a settled bill is not outstanding");
  });

  dbIt("brings money back through the rows it went out on, so Finance nets off by itself", async () => {
    const { purchase, itemId } = await receivedPurchase({ quantity: 4, paid: 460 });
    const before = await getFinanceTotals(RANGE);

    await createPurchaseReturn({
      purchaseId: purchase.id,
      branchId,
      lines: [{ purchaseItemId: itemId, quantity: 2 }],
      reason: "Faulty",
      date: DAY,
      internalNotes: null,
      refund: { amount: 230, paymentAccountId: accountId, reference: "CRN-1" },
      user,
    });

    const after = await getFinanceTotals(RANGE);
    assert.equal(before.supplierPayments - after.supplierPayments, 230, "money out should fall by what came back");
  });

  dbIt("will not hand back more than was ever paid", async () => {
    // Nothing was paid, so there is nothing for the supplier to send back.
    const { purchase, itemId } = await receivedPurchase({ quantity: 4 });
    await assert.rejects(
      createPurchaseReturn({
        purchaseId: purchase.id,
        branchId,
        lines: [{ purchaseItemId: itemId, quantity: 2 }],
        reason: "Faulty",
        date: DAY,
        internalNotes: null,
        refund: { amount: 230, paymentAccountId: accountId, reference: null },
        user,
      }),
      /has been paid/,
    );
  });

  dbIt("puts the stock and the credit back when a return is withdrawn", async () => {
    const { purchase, variantId, itemId } = await receivedPurchase({ quantity: 5, paid: 575 });
    const created = await createPurchaseReturn({
      purchaseId: purchase.id,
      branchId,
      lines: [{ purchaseItemId: itemId, quantity: 3 }],
      reason: "Keyed in error",
      date: DAY,
      internalNotes: null,
      refund: { amount: 345, paymentAccountId: accountId, reference: null },
      user,
    });
    assert.equal(await stockLevel(variantId, branchId), 2);

    const undone = await cancelPurchaseReturn({ returnId: created.id, reason: "Mistake", user });

    assert.equal(await stockLevel(variantId, branchId), 5, "the goods never left");
    assert.equal(Number(undone.purchase.creditedTotal), 0);
    assert.equal(Number(undone.purchase.paidTotal), 575, "and the money row went with it");
    // The line is free to be returned again.
    const item = await db.purchaseItem.findUniqueOrThrow({ where: { id: itemId } });
    assert.equal(Number(item.returnedQuantity), 0);
  });

  dbIt("refuses a return against a purchase that has not arrived", async () => {
    const supplier = await makeSupplier("Nothing Yet Ltd");
    const purchase = await db.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, "PURCHASE", parseDateOnly(DAY));
      return tx.purchase.create({
        data: {
          number,
          supplierId: supplier.id,
          date: parseDateOnly(DAY),
          paymentTermDays: 30,
          dueDate: parseDateOnly("2026-11-25"),
          subtotal: 100,
          vatTotal: 15,
          grandTotal: 115,
          status: "DRAFT",
          items: {
            create: [
              { sortOrder: 0, description: "Widget", quantity: 1, unitPrice: 100, vatRate: 15, lineSubtotal: 100, lineDiscount: 0, lineVat: 15, lineTotal: 115 },
            ],
          },
        },
        include: { items: true },
      });
    });

    await assert.rejects(
      createPurchaseReturn({
        purchaseId: purchase.id,
        branchId,
        lines: [{ purchaseItemId: purchase.items[0].id, quantity: 1 }],
        reason: "Never came",
        date: DAY,
        internalNotes: null,
        refund: null,
        user,
      }),
      /Nothing has been received/,
    );
  });
});
