import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { recapMonthToOffer, summarizeRecap } from "./recap";

let seq = 0;
function item(name: string, boughtAt: string, extra: Partial<Purchase> = {}): Purchase {
  seq += 1;
  return {
    id: `${name}-${seq}`,
    name,
    quantity: 1,
    category: "other",
    status: "bought",
    urgent: false,
    cost: 1,
    listId: "g",
    listName: "Groceries",
    addedByName: "A",
    boughtById: "me",
    boughtByName: "Ahmad",
    createdAt: boughtAt,
    boughtAt,
    ...extra,
  };
}

test("recap: totals, trips, favourites and who shopped", () => {
  const purchases = [
    // September: one trip, 50.
    item("Rice", "2026-09-10T10:00:00", { cost: 50 }),
    item("Olive oil", "2026-09-10T10:05:00", { cost: 5, unit: "L" }),
    // October trip 1 (Ahmad): 30.
    item("Milk", "2026-10-03T10:00:00", { cost: 2, category: "supermarket" }),
    item("Chicken", "2026-10-03T10:05:00", { cost: 22, category: "meat" }),
    item("Olive oil", "2026-10-03T10:10:00", { cost: 6, unit: "L", category: "supermarket" }),
    // October trip 2 (mostly Sara): an invoice of 20 named after the shop.
    item("milk ", "2026-10-12T18:00:00", {
      cost: null, receiptId: "r1", receiptTotal: 20, receiptName: "City Market",
      boughtById: "sara", boughtByName: "Sara",
    }),
    item("Bread", "2026-10-12T18:02:00", {
      cost: null, receiptId: "r1", receiptTotal: 20, receiptName: "City Market",
      boughtById: "sara", boughtByName: "Sara",
    }),
    item("Eggs", "2026-10-12T18:03:00", {
      cost: null, receiptId: "r1", receiptTotal: 20, receiptName: "City Market",
    }),
    // November: not part of October.
    item("Milk", "2026-11-01T09:00:00", { cost: 9 }),
  ];
  const recap = summarizeRecap(purchases, "2026-10");
  assert.equal(recap.items, 6);
  assert.equal(recap.trips, 2);
  assert.equal(recap.total, 50);
  assert.equal(recap.priced, true);
  assert.equal(recap.previousTotal, 55);
  assert.equal(recap.change, -9);
  // "Milk" and "milk " are one item, shown as last written.
  assert.deepEqual(recap.mostBought, { name: "milk", times: 2 });
  assert.equal(recap.topCategory?.category, "meat");
  assert.equal(Math.round((recap.topCategory?.share ?? 0) * 100), 73);
  assert.deepEqual(recap.biggestTrip, { total: 30, name: null });
  // 5 → 6 per litre.
  assert.deepEqual(recap.priceRise, { name: "Olive oil", percent: 20 });
  assert.deepEqual(recap.shoppers, [
    { id: "me", name: "Ahmad", trips: 1 },
    { id: "sara", name: "Sara", trips: 1 },
  ]);
});

test("recap: lines without data are left out", () => {
  const recap = summarizeRecap(
    [
      item("Milk", "2026-10-03T10:00:00", { cost: null }),
      item("Bread", "2026-10-03T10:01:00", { cost: null }),
    ],
    "2026-10",
  );
  assert.equal(recap.items, 2);
  assert.equal(recap.priced, false);
  assert.equal(recap.change, null);
  assert.equal(recap.mostBought, null);
  assert.equal(recap.topCategory, null);
  assert.equal(recap.biggestTrip, null);
  assert.equal(recap.priceRise, null);
});

test("recap: a price compared across different units is not a rise", () => {
  const recap = summarizeRecap(
    [
      item("Tomatoes", "2026-09-03T10:00:00", { cost: 1, unit: "kg" }),
      item("Tomatoes", "2026-10-03T10:00:00", { cost: 3, unit: "box" }),
      // Cheaper than before: also not a rise.
      item("Rice", "2026-09-03T10:00:00", { cost: 10 }),
      item("Rice", "2026-10-03T10:00:00", { cost: 8 }),
    ],
    "2026-10",
  );
  assert.equal(recap.priceRise, null);
});

test("the recap card is offered only in the first week of a month", () => {
  assert.equal(recapMonthToOffer(new Date(2026, 10, 1)), "2026-10");
  assert.equal(recapMonthToOffer(new Date(2026, 10, 7)), "2026-10");
  assert.equal(recapMonthToOffer(new Date(2026, 10, 8)), null);
  assert.equal(recapMonthToOffer(new Date(2027, 0, 2)), "2026-12");
});
