import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import {
  formatTripMinutes,
  lastPrices,
  priceOf,
  savedShopNames,
  summarizeTrip,
  tripDoneItems,
  tripProgress,
} from "./trip-helpers";

function bought(
  id: string,
  boughtAt: string,
  extra: Partial<Purchase> = {},
): Purchase {
  return {
    id,
    name: id,
    quantity: 1,
    category: "other",
    status: "bought",
    urgent: false,
    cost: null,
    listId: "weekly",
    addedByName: "A",
    createdAt: boughtAt,
    boughtAt,
    ...extra,
  };
}

test("saved shop names: newest first, each once, ignoring case", () => {
  const names = savedShopNames([
    bought("a", "2026-11-01T10:00:00Z", { receiptName: "Carrefour" }),
    bought("b", "2026-11-05T10:00:00Z", { receiptName: "Cozmo" }),
    bought("c", "2026-11-03T10:00:00Z", { receiptName: "carrefour " }),
    bought("d", "2026-11-04T10:00:00Z", { receiptName: null }),
  ]);
  assert.deepEqual(names, ["Cozmo", "carrefour"]);
});

test("saved shop names: typing filters, and the exact text is not offered again", () => {
  const purchases = [
    bought("a", "2026-11-01T10:00:00Z", { receiptName: "Carrefour" }),
    bought("b", "2026-11-02T10:00:00Z", { receiptName: "Cozmo" }),
    bought("c", "2026-11-03T10:00:00Z", { receiptName: "Bakery" }),
  ];
  assert.deepEqual(savedShopNames(purchases, "co"), ["Cozmo"]);
  assert.deepEqual(savedShopNames(purchases, "cozmo"), []);
  assert.equal(savedShopNames(purchases, "", 2).length, 2);
});

test("last price is the newest priced purchase of that name", () => {
  const prices = lastPrices([
    bought("milk-1", "2026-11-01T10:00:00Z", { name: "Milk", cost: 1 }),
    bought("milk-2", "2026-11-08T10:00:00Z", { name: "milk", cost: 1.2 }),
    bought("milk-3", "2026-11-09T10:00:00Z", { name: "Milk", cost: null }),
  ]);
  assert.equal(priceOf(prices, " MILK "), 1.2);
  assert.equal(priceOf(prices, "Eggs"), null);
});

test("a trip's done items are this list's purchases since the trip started", () => {
  const start = new Date("2026-11-14T10:00:00Z").getTime();
  const done = tripDoneItems(
    [
      bought("before", "2026-11-14T09:00:00Z"),
      bought("mine", "2026-11-14T10:05:00Z"),
      bought("partner", "2026-11-14T10:06:00Z", { boughtById: "u2" }),
      bought("other-list", "2026-11-14T10:07:00Z", { listId: "pharmacy" }),
    ],
    { listId: "weekly", category: null, startedAt: start },
  );
  assert.deepEqual(done.map((item) => item.id), ["mine", "partner"]);
});

test("progress uses real prices first, then the last price", () => {
  const prices = new Map([
    ["eggs", 3],
    ["milk", 1],
  ]);
  const progress = tripProgress(
    [
      bought("Milk", "2026-11-14T10:00:00Z", { cost: 1.5 }),
      bought("Eggs", "2026-11-14T10:01:00Z"),
      bought("Tahini", "2026-11-14T10:02:00Z"),
    ],
    4,
    prices,
  );
  assert.deepEqual(progress, { done: 3, total: 7, estimate: 4.5, estimated: 2 });
});

test("summary counts an invoice total once and takes the shop name", () => {
  const summary = summarizeTrip({
    done: [
      bought("a", "2026-11-14T10:00:00Z", { receiptId: "r1", receiptTotal: 20, receiptName: "Cozmo" }),
      bought("b", "2026-11-14T10:10:00Z", { receiptId: "r1", receiptTotal: 20, receiptName: "Cozmo" }),
    ],
    left: 1,
    notFound: ["Tahini"],
    startedAt: new Date("2026-11-14T10:00:00Z").getTime(),
    endedAt: new Date("2026-11-14T10:38:00Z").getTime(),
    partners: ["Sara"],
  });
  assert.equal(summary.total, 20);
  assert.equal(summary.shopName, "Cozmo");
  assert.equal(summary.minutes, 38);
  assert.equal(summary.bought, 2);
});

test("trip time reads as minutes, then hours and minutes", () => {
  const labels = {
    minutes: (value: number) => `${value} min`,
    hours: (hours: number, minutes: number) => `${hours} h ${minutes} min`,
  };
  assert.equal(formatTripMinutes(38, labels), "38 min");
  assert.equal(formatTripMinutes(65, labels), "1 h 5 min");
});
