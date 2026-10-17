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
