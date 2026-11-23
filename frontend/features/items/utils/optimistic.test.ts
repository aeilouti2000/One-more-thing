import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import {
  changedDetails,
  keepLocalPhotos,
  sharedReceiptId,
  withAdded,
  withBought,
  withDetails,
  withNeededPatch,
  withNotFound,
  withOrder,
  withReceipt,
  withUndone,
  without,
} from "@/features/items/utils/optimistic";

function item(id: string, extra: Partial<Purchase> = {}): Purchase {
  return {
    id,
    name: id,
    quantity: 1,
    category: "other",
    status: "needed",
    urgent: false,
    listId: "list-a",
    addedByName: "Ahmad",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...extra,
  };
}

const ids = (rows: Purchase[]) => rows.map((row) => row.id);

test("a new item goes below the urgent ones of its list, an urgent one on top", () => {
  const list = [item("rush", { urgent: true }), item("milk"), item("old", { status: "bought" })];
  assert.deepEqual(ids(withAdded(list, item("eggs"))), ["rush", "eggs", "milk", "old"]);
  assert.deepEqual(ids(withAdded(list, item("now", { urgent: true }))), ["now", "rush", "milk", "old"]);
});

test("adding the same id twice keeps one row", () => {
  const list = [item("milk")];
  assert.equal(withAdded(list, item("milk")), list);
});

test("buying sets the price and the buyer and clears urgent and not-found", () => {
  const list = [item("milk", { urgent: true, notFoundAt: "x", notFoundById: "u2" }), item("eggs")];
  const [milk, eggs] = withBought(list, new Map([["milk", 1.5]]), "2026-11-22T09:00:00.000Z", {
    id: "u1",
    name: "Ahmad",
  });
  assert.equal(milk.status, "bought");
  assert.equal(milk.cost, 1.5);
  assert.equal(milk.urgent, false);
  assert.equal(milk.boughtById, "u1");
  assert.equal(milk.notFoundAt, undefined);
  assert.equal(eggs.status, "needed");
});

test("an item someone already bought is not bought again", () => {
  const list = [item("milk", { status: "bought", boughtById: "u2", cost: 2 })];
  const [milk] = withBought(list, new Map([["milk", 9]]), "now", { id: "u1" });
  assert.equal(milk.boughtById, "u2");
  assert.equal(milk.cost, 2);
});

test("undo puts the item back on the list without its price or invoice", () => {
  const list = [item("eggs"), item("milk", { status: "bought", cost: 2, receiptId: "r1", boughtById: "u1" })];
  const next = withUndone(list, "milk");
  const milk = next.find((row) => row.id === "milk");
  assert.equal(milk?.status, "needed");
  assert.equal(milk?.cost, null);
  assert.equal(milk?.receiptId, null);
  assert.equal(milk?.boughtById, undefined);
  assert.equal(next.length, 2);
});

test("only the fields that changed are sent", () => {
  const milk = item("milk", { quantity: 2, notes: "low fat", unit: "L" });
  assert.deepEqual(
    changedDetails(milk, { name: "milk", quantity: 3, category: "other", urgent: false, notes: "low fat", unit: "L" }),
    { quantity: 3 },
  );
  assert.deepEqual(changedDetails(milk, { name: "milk", quantity: 2, category: "other", unit: "" }), {
    unit: "",
  });
  assert.deepEqual(changedDetails(milk, { name: " Milk 2% " }), { name: "Milk 2%" });
});

test("details change on the row; a bought row takes no urgent mark; blank clears", () => {
  const list = [item("milk", { unit: "L", notes: "x" }), item("old", { status: "bought" })];
  const [milk] = withDetails(list, "milk", { quantity: 4, unit: "", notes: " " });
  assert.equal(milk.quantity, 4);
  assert.equal(milk.unit, undefined);
  assert.equal(milk.notes, undefined);
  assert.equal(withDetails(list, "old", { urgent: true })[1].urgent, false);
});

test("bulk changes touch only items still needed", () => {
  const list = [item("a"), item("b", { status: "bought" })];
  const next = withNeededPatch(list, ["a", "b"], { category: "dairy" });
  assert.equal(next[0].category, "dairy");
  assert.equal(next[1].category, "other");
});

test("not-found is marked with who and when, and can be cleared", () => {
  const marked = withNotFound([item("milk")], "milk", { at: "t", by: { id: "u1", name: "Ahmad" } });
  assert.equal(marked[0].notFoundById, "u1");
  assert.equal(withNotFound(marked, "milk", null)[0].notFoundAt, undefined);
});

test("reordering moves the named rows and leaves the rest in place", () => {
  const list = [item("a"), item("b"), item("c"), item("z", { status: "bought" })];
  assert.deepEqual(ids(withOrder(list, ["c", "a"])), ["c", "b", "a", "z"]);
});

test("delete removes rows", () => {
  assert.deepEqual(ids(without([item("a"), item("b")], ["a", "gone"])), ["b"]);
});

test("a trip's invoice: linking items, and renaming reaches every item on it", () => {
  const list = [item("a", { status: "bought" }), item("b", { status: "bought" }), item("c")];
  const linked = withReceipt(list, ["a", "b"], { id: "r1", total: 12.5 });
  assert.equal(linked[0].receiptId, "r1");
  assert.equal(linked[1].receiptTotal, 12.5);
  assert.equal(linked[2].receiptId, undefined);
  const named = withReceipt(linked, [], { id: "r1", name: "Carrefour" });
  assert.equal(named[0].receiptName, "Carrefour");
  assert.equal(named[0].receiptTotal, 12.5);
});

test("re-pricing keeps the invoice id only when exactly those items share it", () => {
  const list = [
    item("a", { status: "bought", receiptId: "r1" }),
    item("b", { status: "bought", receiptId: "r1" }),
    item("c", { status: "bought", receiptId: "r2" }),
    item("d", { status: "bought" }),
  ];
  assert.equal(sharedReceiptId(list, ["a", "b"]), "r1");
  // One of its items is left out: the server makes a new invoice.
  assert.equal(sharedReceiptId(list, ["a"]), null);
  assert.equal(sharedReceiptId(list, ["a", "c"]), null);
  assert.equal(sharedReceiptId(list, ["d"]), null);
});

test("a just-uploaded photo keeps showing from the phone until the server's differs", () => {
  const current = [item("milk", { imageId: "img1", localImageUri: "file://a.jpg" })];
  assert.equal(keepLocalPhotos([item("milk", { imageId: "img1" })], current)[0].localImageUri, "file://a.jpg");
  assert.equal(keepLocalPhotos([item("milk", { imageId: "img2" })], current)[0].localImageUri, undefined);
});
