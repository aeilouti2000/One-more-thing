import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import { deletedOf, mergeItems, mergeTrips } from "@/features/sync/apply";
import type { Trip } from "@/features/sync/types";

const WINDOW = "2026-10-01T00:00:00.000Z";

function item(id: string, extra: Partial<Purchase> = {}): Purchase {
  return {
    id,
    name: id,
    quantity: 1,
    category: "supermarket",
    status: "needed",
    urgent: false,
    addedByName: "Sara",
    createdAt: "2026-11-01T10:00:00.000Z",
    sortOrder: 0,
    ...extra,
  };
}

test("a full answer replaces the copy", () => {
  const merged = mergeItems([item("old")], [item("a"), item("b", { sortOrder: 1 })], {
    full: true,
    deletedIds: [],
    windowStart: WINDOW,
  });
  assert.deepEqual(merged.map((row) => row.id), ["a", "b"]);
});

test("changes are put in place by id and deleted ids removed", () => {
  const current = [item("a", { quantity: 1 }), item("b", { sortOrder: 1 }), item("c", { sortOrder: 2 })];
  const merged = mergeItems(current, [item("a", { quantity: 3 }), item("d", { sortOrder: 3 })], {
    full: false,
    deletedIds: ["b"],
    windowStart: WINDOW,
  });
  assert.deepEqual(merged.map((row) => row.id), ["a", "c", "d"]);
  assert.equal(merged[0].quantity, 3);
});

test("items are ordered like the server: by place, then newest first", () => {
  const merged = mergeItems(
    undefined,
    [
      item("late", { sortOrder: 2 }),
      item("first-old", { sortOrder: 0, createdAt: "2026-11-01T09:00:00.000Z" }),
      item("first-new", { sortOrder: 0, createdAt: "2026-11-02T09:00:00.000Z" }),
    ],
    { full: true, deletedIds: [], windowStart: WINDOW },
  );
  assert.deepEqual(merged.map((row) => row.id), ["first-new", "first-old", "late"]);
});

test("purchases older than the window leave the phone; needed items always stay", () => {
  const merged = mergeItems(
    [
      item("bought-recent", { status: "bought", boughtAt: "2026-10-15T10:00:00.000Z" }),
      item("bought-old", { status: "bought", boughtAt: "2026-09-20T10:00:00.000Z" }),
      item("needed-old", { createdAt: "2025-01-01T10:00:00.000Z" }),
    ],
    [],
    { full: false, deletedIds: [], windowStart: WINDOW },
  );
  assert.deepEqual(merged.map((row) => row.id).sort(), ["bought-recent", "needed-old"]);
});

test("a photo still shown from the phone survives a change to its item", () => {
  const current = [item("a", { imageId: "img1", localImageUri: "file:///photo.jpg" })];
  const merged = mergeItems(current, [item("a", { imageId: "img1", quantity: 2 })], {
    full: false,
    deletedIds: [],
    windowStart: WINDOW,
  });
  assert.equal(merged[0].localImageUri, "file:///photo.jpg");
  assert.equal(merged[0].quantity, 2);
});

test("items follow a renamed list", () => {
  const merged = mergeItems([item("a", { listId: "L", listName: "Weekly" })], [], {
    full: false,
    deletedIds: [],
    windowStart: WINDOW,
    lists: [{ id: "L", homeId: "h", name: "Groceries" }],
  });
  assert.equal(merged[0].listName, "Groceries");
});

test("trips outside the window go, the rest are newest first", () => {
  const trip = (id: string, startedAt: string, lastBoughtAt = startedAt): Trip => ({
    id,
    listId: "L",
    name: null,
    total: null,
    startedAt,
    lastBoughtAt,
  });
  const merged = mergeTrips(
    [trip("old", "2026-09-01T10:00:00.000Z"), trip("oct", "2026-10-05T10:00:00.000Z")],
    [trip("nov", "2026-11-05T10:00:00.000Z")],
    { full: false, deletedIds: [], windowStart: WINDOW },
  );
  assert.deepEqual(merged.map((row) => row.id), ["nov", "oct"]);
});

test("deletedOf picks one kind", () => {
  const deleted = [
    { type: "item", id: "1" },
    { type: "trip", id: "2" },
    { type: "item", id: "3" },
  ];
  assert.deepEqual(deletedOf(deleted, "item"), ["1", "3"]);
  assert.deepEqual(deletedOf(undefined, "item"), []);
});
