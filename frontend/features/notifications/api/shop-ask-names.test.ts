import assert from "node:assert/strict";
import { test } from "node:test";
import { splitNames } from "./shop-ask-names";

test("a typed reply becomes separate items", () => {
  assert.deepEqual(splitNames("milk, Bread\n eggs ،  خبز"), ["milk", "Bread", "eggs", "خبز"]);
  assert.deepEqual(splitNames("  two   kg tomatoes "), ["two kg tomatoes"]);
});

test("repeats and blanks are dropped, and a reply is capped at ten items", () => {
  assert.deepEqual(splitNames("Milk, milk, ,;"), ["Milk"]);
  const many = Array.from({ length: 15 }, (_, index) => `item ${index}`).join(",");
  assert.equal(splitNames(many).length, 10);
  assert.deepEqual(splitNames("   "), []);
});
