import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCostInput } from "@/features/items/utils/currency";
import { parseDecimal } from "./numbers";
import { parseQuantity } from "./validation";

test("reads Western, Arabic and Persian digits with either decimal mark", () => {
  assert.equal(parseDecimal("1.5"), 1.5);
  assert.equal(parseDecimal("1,5"), 1.5);
  assert.equal(parseDecimal("١٫٥"), 1.5);
  assert.equal(parseDecimal("١.٥"), 1.5);
  assert.equal(parseDecimal("۲۵"), 25);
  assert.equal(parseDecimal(" 12 "), 12);
  assert.equal(parseDecimal("3."), 3);
  assert.equal(parseDecimal(".5"), 0.5);
});

test("rejects anything that is not a plain amount", () => {
  for (const text of ["", " ", "abc", "-1", "1e3", "0x10", "1,234.5", "1 000", "1.2.3", "."]) {
    assert.ok(Number.isNaN(parseDecimal(text)), text);
  }
});

test("cost field: empty is no price, bad text is invalid", () => {
  assert.equal(parseCostInput(""), null);
  assert.equal(parseCostInput("  "), null);
  assert.equal(parseCostInput("٢٫٧٥٠"), 2.75);
  assert.equal(parseCostInput("1.0005"), 1.001);
  assert.equal(parseCostInput("0"), 0);
  assert.ok(Number.isNaN(parseCostInput("-2") as number));
  assert.ok(Number.isNaN(parseCostInput("two") as number));
});

test("quantity is between 1 and 9999", () => {
  assert.equal(parseQuantity("٢"), 2);
  assert.equal(parseQuantity("1,5"), 1.5);
  assert.equal(parseQuantity("9999"), 9999);
  assert.equal(parseQuantity("0"), null);
  assert.equal(parseQuantity("0.5"), null);
  assert.equal(parseQuantity("10000"), null);
  assert.equal(parseQuantity(""), null);
});
