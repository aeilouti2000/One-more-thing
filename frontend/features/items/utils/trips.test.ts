import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { groupPurchasesIntoTrips, latestInvoiceThisMonth, moveTargets } from "./trips";

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

test("an item bought outside a trip joins this month's latest invoice", () => {
  const onReceipt = (id: string, at: string, receiptId: string): Purchase => ({
    ...item(id, at),
    receiptId,
    receiptTotal: 6,
  });
  const now = new Date(2026, 10, 20, 12);
  const items = [
    onReceipt("milk", new Date(2026, 10, 10, 10).toISOString(), "shop-1"),
    onReceipt("soap", new Date(2026, 10, 18, 10).toISOString(), "shop-2"),
    onReceipt("old", new Date(2026, 9, 30, 10).toISOString(), "october"),
  ];
  assert.equal(latestInvoiceThisMonth(items, now), "shop-2");
  // Nothing this month: the item stays on its own.
  assert.equal(latestInvoiceThisMonth(items.slice(2), now), null);
});

test("move targets are the other trips of the same month", () => {
  const onReceipt = (id: string, at: Date, receiptId: string): Purchase => ({
    ...item(id, at.toISOString()),
    receiptId,
    receiptTotal: 5,
    receiptName: receiptId === "r1" ? "Carrefour" : null,
  });
  const trips = groupPurchasesIntoTrips([
    onReceipt("milk", new Date(2026, 10, 3, 10), "r1"),
    onReceipt("soap", new Date(2026, 10, 9, 10), "r2"),
    onReceipt("tea", new Date(2026, 9, 9, 10), "r3"),
  ]);
  assert.equal(trips.find((trip) => trip.receiptId === "r1")?.name, "Carrefour");
  const milk = trips.flatMap((trip) => trip.items).find((entry) => entry.id === "milk")!;
  assert.deepEqual(
    moveTargets(trips, milk).map((trip) => trip.receiptId),
    ["r2"],
  );
});

test("an invoice without a total counts its items' own prices", () => {
  const trips = groupPurchasesIntoTrips([
    { ...item("milk", "2026-11-03T10:00:00.000Z", "groceries", 2), receiptId: "r1", receiptTotal: null },
    { ...item("eggs", "2026-11-03T10:05:00.000Z", "groceries", 3), receiptId: "r1", receiptTotal: null },
  ]);
  assert.equal(trips.length, 1);
  assert.equal(trips[0]?.total, 5);
});
