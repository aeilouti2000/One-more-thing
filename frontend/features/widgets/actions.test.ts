import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { invoiceForBuy, isUnsavedId, planPinAdd } from "./actions";

function item(fields: Partial<Purchase> & { id: string; name: string }): Purchase {
  return {
    quantity: 1,
    category: "other",
    status: "needed",
    urgent: false,
    listId: "list-1",
    addedByName: "Sara",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...fields,
  };
}

const lists = [{ id: "list-1" }, { id: "list-2" }];

test("a pin that is not on any list is added to its own list", () => {
  assert.deepEqual(planPinAdd({ name: "Milk", listId: "list-2" }, [], lists, "list-1"), {
    kind: "create",
    listId: "list-2",
  });
});

test("a pin without a list, or whose list is gone, goes to the current list", () => {
  assert.deepEqual(planPinAdd({ name: "Milk", listId: null }, [], lists, "list-1"), {
    kind: "create",
    listId: "list-1",
  });
  assert.deepEqual(planPinAdd({ name: "Milk", listId: "deleted" }, [], lists, "list-1"), {
    kind: "create",
    listId: "list-1",
  });
  assert.deepEqual(planPinAdd({ name: "Milk", listId: null }, [], [], null), {
    kind: "create",
    listId: undefined,
  });
});

test("already waiting: nothing is added, so a tap sent twice cannot double it", () => {
  const items = [item({ id: "a", name: " milk" })];
  assert.deepEqual(planPinAdd({ name: "Milk", listId: null }, items, lists, "list-1"), { kind: "exists" });
  // Bought ones do not count: buying it again is the point of a pin.
  const boughtOnly = [item({ id: "b", name: "Milk", status: "bought" })];
  assert.equal(planPinAdd({ name: "Milk", listId: null }, boughtOnly, lists, "list-1").kind, "create");
});

test("parked on the Later shelf of that list: it comes back instead of a twin", () => {
  const parked = [item({ id: "a", name: "Milk", laterAt: "2026-11-10T10:00:00.000Z" })];
  assert.deepEqual(planPinAdd({ name: "Milk", listId: null }, parked, lists, "list-1"), {
    kind: "restore",
    itemId: "a",
  });
  // Parked on another list: this list gets its own.
  assert.deepEqual(planPinAdd({ name: "Milk", listId: "list-2" }, parked, lists, "list-1"), {
    kind: "create",
    listId: "list-2",
  });
});

test("a ticked item joins this month's invoice only in trip-total mode", () => {
  const now = new Date(2026, 10, 20, 12);
  const target = item({ id: "a", name: "Milk" });
  const items = [
    target,
    item({
      id: "b",
      name: "Bread",
      status: "bought",
      boughtAt: new Date(2026, 10, 18, 9).toISOString(),
      receiptId: "receipt-1",
    }),
  ];
  assert.equal(invoiceForBuy({ costsEnabled: true, tripCostMode: "total" }, items, target, now), "receipt-1");
  assert.equal(invoiceForBuy({ costsEnabled: true, tripCostMode: "items" }, items, target, now), null);
  assert.equal(invoiceForBuy({ costsEnabled: false, tripCostMode: "total" }, items, target, now), null);
  const elsewhere = item({ id: "c", name: "Milk", listId: "list-2" });
  assert.equal(invoiceForBuy({ costsEnabled: true, tripCostMode: "total" }, items, elsewhere, now), null);
});

test("rows the server has not saved yet are recognised", () => {
  assert.equal(isUnsavedId("temp-123"), true);
  assert.equal(isUnsavedId("0b0e5a52-1111"), false);
});
