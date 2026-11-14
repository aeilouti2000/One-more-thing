import assert from "node:assert/strict";
import { test } from "node:test";
import { allSelected, sharedValue } from "./selection";

type Row = { category: string; unit?: string };

const unitOf = (row: Row) => row.unit ?? "";

test("sharedValue: the common value when every item agrees", () => {
  const rows: Row[] = [{ category: "meat" }, { category: "meat" }];
  assert.equal(sharedValue(rows, (row) => row.category), "meat");
});

test("sharedValue: undefined when items differ", () => {
  const rows: Row[] = [{ category: "meat" }, { category: "other" }];
  assert.equal(sharedValue(rows, (row) => row.category), undefined);
});

test("sharedValue: undefined for no items", () => {
  assert.equal(sharedValue([] as Row[], (row) => row.category), undefined);
});

test("sharedValue: a single item shares its own value", () => {
  assert.equal(sharedValue([{ category: "coffee" }], (row: Row) => row.category), "coffee");
});

test("sharedValue: 'no unit' counts as a shared value, not as mixed", () => {
  const rows: Row[] = [{ category: "meat" }, { category: "other", unit: undefined }];
  assert.equal(sharedValue(rows, unitOf), "");
});

test("sharedValue: a unit on only some items is mixed", () => {
  const rows: Row[] = [{ category: "meat", unit: "kg" }, { category: "meat" }];
  assert.equal(sharedValue(rows, unitOf), undefined);
});

test("allSelected: true only when every id is selected", () => {
  assert.equal(allSelected(["a", "b"], new Set(["a", "b", "c"])), true);
  assert.equal(allSelected(["a", "b"], new Set(["a"])), false);
});

test("allSelected: false for an empty list", () => {
  assert.equal(allSelected([], new Set(["a"])), false);
});
