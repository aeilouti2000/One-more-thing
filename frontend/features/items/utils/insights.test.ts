import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { summarizeSpend } from "@/features/items/utils/currency";
import {
  boughtInMonth,
  isCountableUnit,
  lastPrice,
  priceFor,
  previousMonth,
  purchasesToCsv,
  suggestItems,
  summarizeMonth,
  TRIP_TOTALS,
} from "./insights";

function item(name: string, boughtAt: string, extra: Partial<Purchase> = {}): Purchase {
  return {
    id: `${name}-${boughtAt}`,
    name,
    quantity: 1,
    category: "other",
    status: "bought",
    urgent: false,
    cost: 1,
    listId: "g",
    listName: "Groceries",
    addedByName: "A",
    createdAt: boughtAt,
    boughtAt,
    ...extra,
  };
}

const labels = {
  date: "Date", item: "Item", quantity: "Qty", unit: "Unit", category: "Category", list: "List",
  boughtBy: "By", price: "Price", invoice: "Invoice", invoiceTotal: "Invoice total", total: "Total",
};

test("suggests past purchases once each, newest first, with the last price", () => {
  const purchases = [
    item("Milk", "2026-10-01T10:00:00Z", { cost: 2 }),
    item("milk ", "2026-11-01T10:00:00Z", { cost: null, category: "supermarket" }),
    item("Mint", "2026-10-20T10:00:00Z"),
    item("Almond milk", "2026-11-05T10:00:00Z"),
    item("Bread", "2026-11-06T10:00:00Z"),
    item("Mineral water", "2026-11-07T10:00:00Z", { status: "needed", boughtAt: undefined }),
  ];
  const found = suggestItems(purchases, "mi");
  assert.deepEqual(found.map((entry) => entry.name), ["milk", "Mint", "Almond milk"]);
  // Newest purchase gives the name and category; the price comes from the last priced one.
  assert.equal(found[0].category, "supermarket");
  assert.equal(found[0].lastCost, 2);
  assert.deepEqual(suggestItems(purchases, "mi", { exclude: ["MILK"] }).map((e) => e.name), [
    "Mint",
    "Almond milk",
  ]);
  assert.deepEqual(suggestItems(purchases, "  "), []);
});

test("remembers the last price by name", () => {
  const purchases = [
    item("Milk", "2026-10-01T10:00:00Z", { cost: 2 }),
    item("Milk", "2026-11-01T10:00:00Z", { cost: 2.5 }),
    item("Milk", "2026-11-03T10:00:00Z", { cost: null }),
  ];
  assert.deepEqual(lastPrice(purchases, " milk"), {
    cost: 2.5,
    each: null,
    boughtAt: "2026-11-01T10:00:00Z",
  });
  assert.equal(lastPrice(purchases, "Bread"), null);
  assert.equal(lastPrice(purchases, "Milk", purchases[1].id)?.cost, 2);
});

test("pieces and packs are remembered by the price of one", () => {
  // 3 pieces for 3 → 1 each, so 5 pieces suggest 5.
  assert.deepEqual(priceFor({ cost: 3, quantity: 3 }, { quantity: 5 }), { cost: 5, each: 1 });
  assert.deepEqual(priceFor({ cost: 5, quantity: 2, unit: "pack" }, { quantity: 1, unit: "pack" }), {
    cost: 2.5,
    each: 2.5,
  });
  // The same quantity gives back exactly what was paid (no rounding drift).
  assert.equal(priceFor({ cost: 1, quantity: 3 }, { quantity: 3 }).cost, 1);
  assert.equal(priceFor({ cost: 1, quantity: 3 }, { quantity: 1 }).cost, 0.333);
});

test("measured and custom units keep the whole price", () => {
  for (const unit of ["ml", "g", "kg", "L", "bottle"]) {
    assert.deepEqual(priceFor({ cost: 2, quantity: 500, unit }, { quantity: 250, unit }), {
      cost: 2,
      each: null,
    });
  }
  // A different unit than last time: nothing to scale by.
  assert.equal(priceFor({ cost: 3, quantity: 3 }, { quantity: 2, unit: "pack" }).cost, 3);
  assert.equal(isCountableUnit(""), true);
  assert.equal(isCountableUnit("pack"), true);
  assert.equal(isCountableUnit("kg"), false);
  assert.equal(isCountableUnit("box"), false);
});

test("suggestions and the cost sheet use the price of one piece", () => {
  const purchases = [item("Eggs", "2026-11-01T10:00:00Z", { cost: 3, quantity: 3 })];
  assert.equal(suggestItems(purchases, "eg")[0].lastCost, 1);
  assert.deepEqual(lastPrice(purchases, "Eggs", undefined, { quantity: 5 }), {
    cost: 5,
    each: 1,
    boughtAt: "2026-11-01T10:00:00Z",
  });
  const milk = [item("Milk", "2026-11-01T10:00:00Z", { cost: 2, quantity: 500, unit: "ml" })];
  assert.equal(suggestItems(milk, "mi")[0].lastCost, 2);
});

test("month summary matches History's total and splits by category", () => {
  const purchases = [
    item("Milk", "2026-11-02T10:00:00Z", { cost: 2, category: "dairy" }),
    item("Soap", "2026-11-02T10:00:00Z", { cost: null }),
    // One invoice of 20: 5 itemised, 15 as a lump.
    item("Meat", "2026-11-10T10:00:00Z", { cost: 5, category: "meat", receiptId: "r1", receiptTotal: 20 }),
    item("Rice", "2026-11-10T10:05:00Z", { cost: null, receiptId: "r1", receiptTotal: 20 }),
    // An invoice that starts in October stays in October, whole.
    item("Tea", "2026-10-30T10:00:00Z", { cost: 3, receiptId: "r0", receiptTotal: 9 }),
    item("Jam", "2026-11-01T09:00:00Z", { cost: 6, receiptId: "r0", receiptTotal: 9 }),
  ];
  const november = summarizeMonth(purchases, "2026-11");
  assert.equal(november.total, 22);
  assert.equal(november.total, summarizeSpend(boughtInMonth(purchases, "2026-11")).total);
  assert.equal(november.count, 4);
  assert.equal(november.unpriced, 1);
  assert.deepEqual(november.byCategory, [
    { category: TRIP_TOTALS, total: 15 },
    { category: "meat", total: 5 },
    { category: "dairy", total: 2 },
  ]);
  assert.equal(summarizeMonth(purchases, "2026-10").total, 9);
  assert.equal(previousMonth("2026-01"), "2025-12");
});

test("csv escapes text and writes each invoice total once", () => {
  const csv = purchasesToCsv(
    [
      item('Olive "extra", oil', "2026-11-10T10:00:00Z", { cost: 9, receiptId: "r1", receiptTotal: 12, receiptName: "Carrefour" }),
      item("=SUM(A1)", "2026-11-10T10:05:00Z", { cost: null, receiptId: "r1", receiptTotal: 12, receiptName: "Carrefour" }),
    ],
    labels,
    (category) => category,
    12,
  );
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(lines.length, 4);
  assert.ok(lines[1].includes('"Olive ""extra"", oil"'));
  assert.ok(lines[1].endsWith(",9,Carrefour,12"));
  assert.ok(lines[2].includes("'=SUM(A1)"));
  assert.ok(lines[2].endsWith(",,Carrefour,"));
  assert.ok(lines[3].startsWith("Total,"));
});
