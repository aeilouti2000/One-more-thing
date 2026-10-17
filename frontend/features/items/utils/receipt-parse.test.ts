import assert from "node:assert/strict";
import { test } from "node:test";
import { formatCostInput } from "./currency";
import { matchReceiptLines } from "./receipt-match";
import { parseReceiptText } from "./receipt-parse";

test("reads arabic digits, skips tax, and keeps the labeled total", () => {
  const parsed = parseReceiptText(`
    Milk 1L 1.250
    خبز 0.450
    حليب نادك ١٫٢٥٠
    VAT 0.160
    المجموع 3.110
  `);
  assert.equal(parsed.total, 3.11);
  assert.deepEqual(
    parsed.lines.map((line) => line.amount),
    [1.25, 0.45, 1.25],
  );
  assert.equal(parsed.lines[2]?.name.includes("حليب"), true);
});

test("matches a short list name to a longer receipt name and leaves the other open", () => {
  const parsed = parseReceiptText("NADK MILK 1L 1.250\nTANOUR BREAD 0.800\nTotal 2.050");
  const matches = matchReceiptLines(
    [
      { id: "milk", name: "Milk", quantity: 1 },
      { id: "soap", name: "Soap", quantity: 1 },
    ],
    parsed.lines,
  );
  assert.deepEqual(matches, [{ itemId: "milk", lineId: "r0" }]);
});

test("matches arabic list names after letter folding", () => {
  const parsed = parseReceiptText("أرز بسمتي 2.500\nالإجمالي 2.500");
  const matches = matchReceiptLines([{ id: "rice", name: "ارز" }], parsed.lines);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.itemId, "rice");
});

test("reads a price written before the item name", () => {
  const parsed = parseReceiptText("1.250 حليب\n0.800 خبز\nالإجمالي 2.050");
  assert.deepEqual(
    parsed.lines.map((line) => line.name),
    ["حليب", "خبز"],
  );
  assert.equal(parsed.total, 2.05);
});

test("joins a name with the price on the following line", () => {
  const parsed = parseReceiptText("Milk\n1.250\nBread\n0.800\nTotal\n2.050");
  assert.deepEqual(
    parsed.lines.map((line) => [line.name, line.amount]),
    [
      ["Milk", 1.25],
      ["Bread", 0.8],
    ],
  );
  assert.equal(parsed.total, 2.05);
});

test("formats money for the cost field", () => {
  assert.equal(formatCostInput(1.25, "JOD"), "1.25");
  assert.equal(formatCostInput(10, "USD"), "10");
});
