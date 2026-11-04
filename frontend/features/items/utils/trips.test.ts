import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { groupPurchasesIntoTrips } from "./trips";

function item(id: string, boughtAt: string, listId = "groceries", cost: number | null = 1): Purchase {
  return {
    id,
    name: id,
    quantity: 1,
    category: "other",
    status: "bought",
    urgent: false,
    cost,
    listId,
    listName: "Groceries",
    addedByName: "A",
    createdAt: boughtAt,
    boughtAt,
  };
}

test("splits the same list into separate trips when the gap is long", () => {
  const trips = groupPurchasesIntoTrips([
    item("milk", "2026-10-17T10:00:00.000Z"),
    item("bread", "2026-10-17T10:20:00.000Z"),
    item("soap", "2026-10-17T14:00:00.000Z"),
  ]);
  assert.equal(trips.length, 2);
  assert.deepEqual(
    trips.map((trip) => trip.items.map((entry) => entry.id)),
    [["soap"], ["bread", "milk"]],
  );
});

test("keeps other lists as their own trips", () => {
  const trips = groupPurchasesIntoTrips([
    item("milk", "2026-10-17T10:00:00.000Z", "groceries"),
    item("charger", "2026-10-17T10:05:00.000Z", "pharmacy"),
  ]);
  assert.equal(trips.length, 2);
});

test("a trip saved with one total is its own trip and uses that total", () => {
  const withReceipt = (id: string, at: string): Purchase => ({
    ...item(id, at, "groceries", null),
    receiptId: "r1",
    receiptTotal: 12.5,
  });
  const trips = groupPurchasesIntoTrips([
    withReceipt("milk", "2026-10-17T10:00:00.000Z"),
    withReceipt("bread", "2026-10-17T10:10:00.000Z"),
    // Same list, inside the gap, but not on the receipt: separate trip.
    item("soap", "2026-10-17T10:20:00.000Z", "groceries", 2),
  ]);
  assert.equal(trips.length, 2);
  const receiptTrip = trips.find((trip) => trip.items.some((entry) => entry.id === "milk"));
  assert.equal(receiptTrip?.total, 12.5);
  assert.equal(receiptTrip?.priced, 2);
  assert.equal(receiptTrip?.count, 2);
});
