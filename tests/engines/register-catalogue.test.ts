import assert from "node:assert/strict";
import { before, describe } from "node:test";
import { db } from "@/lib/db";
import { dbIt, startFreshDatabase } from "@/lib/test-support/database";
import { makeBranch, makeProduct, makeSettings } from "@/lib/test-support/factories";
import { listRegisterItems } from "@/lib/data/pos";

/**
 * What a till offers, and what it must not.
 *
 * `Item.branchId` says which shop sells something, with null meaning every shop. Before it, the
 * branch decided only which stock figure to look up, so a company running a restaurant and a
 * salon put hairdressing on the restaurant's screen.
 *
 * Both ways of getting this wrong are quiet. Too much, and a cashier scrolls past things their
 * shop has never sold. Too little, and an item simply stops appearing on any till at all —
 * no error, no empty state, nothing on screen to explain where it went. Neither shows up as a
 * failure anywhere else, which is why they are pinned here against a real database.
 */

describe("what the till offers", () => {
  let restaurant = "";
  let salon = "";

  /** Pinned to the restaurant. */
  let grill = "";
  /** Pinned to the salon. */
  let shampoo = "";
  /** Sold everywhere. */
  let water = "";

  before(() =>
    startFreshDatabase(async () => {
      await makeSettings();
      restaurant = (await makeBranch("Restaurant", true)).id;
      salon = (await makeBranch("Salon", false)).id;

      const grillItem = await makeProduct({ name: "Mixed Grill", salePrice: 85, branchId: restaurant, openingStock: 10 });
      const shampooItem = await makeProduct({ name: "Argan Shampoo", salePrice: 85, branchId: salon, openingStock: 7 });
      const waterItem = await makeProduct({ name: "Bottled Water", salePrice: 3, branchId: restaurant, openingStock: 50 });

      // The factory stocks a branch but never pins an item, so the pinning — the thing under
      // test — is done here, in the open.
      await db.item.update({ where: { id: grillItem.item.id }, data: { branchId: restaurant } });
      await db.item.update({ where: { id: shampooItem.item.id }, data: { branchId: salon } });
      await db.item.update({ where: { id: waterItem.item.id }, data: { branchId: null } });

      grill = grillItem.variant.id;
      shampoo = shampooItem.variant.id;
      water = waterItem.variant.id;
    }),
  );

  dbIt("offers a shop its own items and nobody else's", async () => {
    const onRestaurant = (await listRegisterItems(restaurant)).map((row) => row.variantId);
    const onSalon = (await listRegisterItems(salon)).map((row) => row.variantId);

    assert.ok(onRestaurant.includes(grill), "the restaurant sells the grill");
    assert.ok(!onRestaurant.includes(shampoo), "and has never sold shampoo");

    assert.ok(onSalon.includes(shampoo), "the salon sells the shampoo");
    assert.ok(!onSalon.includes(grill), "and has never sold a mixed grill");
  });

  dbIt("offers an unpinned item everywhere, which is what null means", async () => {
    // The common case by far: most companies sell the same things at every shop, and an item
    // nobody pinned must not vanish from all of them.
    for (const branchId of [restaurant, salon]) {
      const offered = (await listRegisterItems(branchId)).map((row) => row.variantId);
      assert.ok(offered.includes(water), "an item belonging to no branch is sold at every branch");
    }
  });

  dbIt("still shows each branch its own stock figure", async () => {
    // What `branchId` did in this query before any of this, and the half most easily lost while
    // adding the other: a till that lists the right items against another shop's quantities.
    const here = (await listRegisterItems(restaurant)).find((row) => row.variantId === water);
    const there = (await listRegisterItems(salon)).find((row) => row.variantId === water);

    assert.equal(here?.stock, 50, "the restaurant counts the water it holds");
    assert.equal(there?.stock, 0, "the salon was never given any");
  });

  dbIt("keeps a withdrawn item off the till even at the branch that sold it", async () => {
    /**
     * The guard on how the condition is written. "Sold here" was added *alongside* the active
     * checks, not in place of them — an `OR` written one level up would swallow them, and a
     * withdrawn item would come back to the one screen that can sell it.
     */
    const { item, variant } = await makeProduct({ name: "Discontinued Dish", salePrice: 40, branchId: restaurant, openingStock: 4 });
    await db.item.update({ where: { id: item.id }, data: { branchId: restaurant, isActive: false } });

    const offered = (await listRegisterItems(restaurant)).map((row) => row.variantId);
    assert.ok(!offered.includes(variant.id), "withdrawing an item takes it off the till it was pinned to");
  });

  dbIt("keeps a withdrawn variant off it too", async () => {
    // The same trap one level down: the variant's own `isActive` must survive the change.
    const { item, variant } = await makeProduct({ name: "Old Size", salePrice: 25, branchId: restaurant, openingStock: 4 });
    await db.item.update({ where: { id: item.id }, data: { branchId: restaurant } });
    await db.itemVariant.update({ where: { id: variant.id }, data: { isActive: false } });

    const offered = (await listRegisterItems(restaurant)).map((row) => row.variantId);
    assert.ok(!offered.includes(variant.id), "a withdrawn variant is not sellable anywhere");
  });
});
