import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { normalizeName, suggestItems } from "@/features/items/utils/insights";
import { lastPrices } from "@/features/items/utils/trip-helpers";
import { productLines } from "@/features/sync/products";
import type { Product } from "@/features/sync/types";

let next = 0;
function bought(name: string, day: number, extra: Partial<Purchase> = {}): Purchase {
  next += 1;
  const at = new Date(Date.UTC(2026, 6, day, 10)).toISOString();
  return {
    id: `p${next}`,
    name,
    quantity: 1,
    category: "vegetables",
    status: "bought",
    urgent: false,
    cost: null,
    addedByName: "Sara",
    createdAt: at,
    boughtAt: at,
    ...extra,
  };
}

/** What the server keeps for these purchases (backend ProductsService / migration 028). */
function productsOf(history: Purchase[]): Product[] {
  const byKey = new Map<string, Product>();
  const newestFirst = [...history].sort((a, b) => (b.boughtAt ?? "").localeCompare(a.boughtAt ?? ""));
  for (const item of newestFirst) {
    const key = normalizeName(item.name);
    let product = byKey.get(key);
    if (!product) {
      product = {
        id: key,
        name: item.name.trim(),
        nameKey: key,
        category: item.category,
        unit: item.unit ?? null,
        lastCost: null,
        lastCostQuantity: null,
        lastCostUnit: null,
        lastCostAt: null,
        lastBoughtAt: item.boughtAt as string,
        timesBought: 0,
      };
      byKey.set(key, product);
    }
    product.timesBought += 1;
    if (product.lastCostAt === null && typeof item.cost === "number") {
      product.lastCost = item.cost;
      product.lastCostQuantity = item.quantity;
      product.lastCostUnit = item.unit ?? null;
      product.lastCostAt = item.boughtAt as string;
    }
  }
  return [...byKey.values()];
}

const history = [
  bought("Tomatoes", 1, { cost: 1.5, quantity: 2, unit: "kg" }),
  bought("tomatoes", 9),
  bought("Tomato paste", 4, { cost: 0.75, category: "supermarket" }),
  bought("Eggs", 3, { cost: 3, quantity: 30, unit: "pack" }),
  bought("Eggs", 12, { cost: 2.5, quantity: 12 }),
  bought("Milk", 5, { cost: 1.25, category: "supermarket" }),
  bought("خُبْز", 2, { cost: 0.5, category: "supermarket" }),
  bought("خبز", 8, { category: "supermarket" }),
];
const lines = productLines(productsOf(history));

test("suggestions from products match suggestions from the whole history", () => {
  for (const typed of ["tom", "TOMATO", "eg", "خب", "m", "zzz"]) {
    assert.deepEqual(suggestItems(lines, typed), suggestItems(history, typed), typed);
  }
});

test("last prices from products match last prices from the whole history", () => {
  assert.deepEqual([...lastPrices(lines)].sort(), [...lastPrices(history)].sort());
});
