import assert from "node:assert/strict";
import { test } from "node:test";
import { hideToast, readToast, showToast } from "./toast";

test("a new message replaces the one showing", () => {
  showToast("first");
  const first = readToast();
  showToast("saved", "success");
  assert.equal(readToast()?.message, "saved");
  assert.equal(readToast()?.tone, "success");

  // A late hide for the old card leaves the new one alone.
  hideToast(first?.id);
  assert.equal(readToast()?.message, "saved");

  hideToast();
  assert.equal(readToast(), null);
});

test("an empty message shows nothing", () => {
  showToast("");
  assert.equal(readToast(), null);
});
