import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { localPurchases, localStats, localTrips } from "@/features/items/utils/history-local";

function bought(id: string, at: Date, extra: Partial<Purchase> = {}): Purchase {
  return {
    id,
    name: id,
    quantity: 1,
    category: "other",
    status: "bought",
    urgent: false,
    addedByName: "Sara",
    listId: "l1",
    listName: "Weekly",
    createdAt: at.toISOString(),
    boughtAt: at.toISOString(),
    ...extra,
  };
}

const items: Purchase[] = [
  bought("a", new Date(2026, 10, 20, 10), { category: "meat", cost: 5, receiptId: "t1", receiptTotal: 12, receiptName: "Carrefour" }),
  bought("b", new Date(2026, 10, 20, 10, 5), { category: "vegetables", receiptId: "t1", receiptTotal: 12, receiptName: "Carrefour" }),
  bought("c", new Date(2026, 10, 22, 9), { category: "meat", cost: 2.5, listId: "l2" }),
  // A trip that started on the last evening of October belongs to October.
  bought("d", new Date(2026, 9, 31, 23, 50), { cost: 1 }),
  bought("e", new Date(2026, 10, 1, 0, 10), { cost: 1 }),
  { ...bought("f", new Date(2026, 10, 21)), status: "needed" },
];

test("offline, a month's purchases come from the saved items, newest first, by trip start", () => {
  assert.deepEqual(localPurchases(items, "2026-11", { listId: null, category: null }).map((item) => item.id), ["c", "b", "a"]);
  assert.deepEqual(localPurchases(items, "2026-10", { listId: null, category: null }).map((item) => item.id), ["e", "d"]);
  assert.deepEqual(localPurchases(items, "2026-11", { listId: null, category: "meat" }).map((item) => item.id), ["c", "a"]);
  assert.deepEqual(localPurchases(items, "2026-11", { listId: "l2", category: null }).map((item) => item.id), ["c"]);
});

test("offline trips and month totals follow the same spend rule as the server", () => {
  const trips = localTrips(items, "2026-11", null);
  assert.deepEqual(trips.map((trip) => [trip.id, trip.total, trip.hasTotal, trip.itemCount]), [
    ["c", 2.5, false, 1],
    ["t1", 12, true, 2],
  ]);
  assert.equal(trips[1].name, "Carrefour");
  const stats = localStats(items, "2026-11", 300);
  assert.equal(stats.spend, 14.5);
  assert.equal(stats.itemCount, 3);
  assert.equal(stats.tripCount, 2);
  assert.deepEqual(
    stats.categories.sort((a, b) => a.category.localeCompare(b.category)),
    [
      { category: "", itemCount: 0, spend: 7 },
      { category: "meat", itemCount: 2, spend: 7.5 },
      { category: "vegetables", itemCount: 1, spend: 0 },
    ],
  );
  assert.equal(localStats(items, "2026-09", null).state, "none");
});
