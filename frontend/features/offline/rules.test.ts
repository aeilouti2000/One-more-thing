import assert from "node:assert/strict";
import { test } from "node:test";
import { newId } from "@/features/offline/ids";
import {
  BUSY_TRIES,
  MAX_TRIES,
  failureKind,
  isAlreadyGone,
  keepsWaiting,
  probeWaitMs,
  retryWaitMs,
} from "@/features/offline/rules";

const network = Object.assign(new Error("Network request failed"), { code: "NETWORK" });
const gone = Object.assign(new Error("Item not found"), { code: "ITEM_NOT_FOUND", status: 404 });
const busy = Object.assign(new Error("Too many requests"), { status: 429 });

test("no answer from the server keeps a change waiting", () => {
  assert.equal(failureKind(network), "offline");
  assert.equal(failureKind(new Error("Network request timed out")), "offline");
  assert.equal(keepsWaiting(1, network), true);
  assert.equal(keepsWaiting(MAX_TRIES - 1, network), true);
});

test("a real refusal drops the change", () => {
  assert.equal(failureKind(gone), "refused");
  assert.equal(keepsWaiting(1, gone), false);
  assert.equal(failureKind(Object.assign(new Error("Bad"), { status: 400 })), "refused");
  // An answer that mentions the network is still an answer.
  assert.equal(failureKind(Object.assign(new Error("network name invalid"), { status: 400 })), "refused");
});

test("a busy server is tried again a few times, then given up on", () => {
  assert.equal(failureKind(busy), "busy");
  assert.equal(failureKind(Object.assign(new Error("Bad gateway"), { status: 502 })), "busy");
  assert.equal(keepsWaiting(1, busy), true);
  assert.equal(keepsWaiting(BUSY_TRIES, busy), false);
});

test("nothing waits forever", () => {
  assert.equal(keepsWaiting(MAX_TRIES, network), false);
});

test("waits grow while the server is busy and stay short while offline", () => {
  assert.equal(retryWaitMs(1, network), 800);
  assert.equal(retryWaitMs(1, busy), 2000);
  assert.equal(retryWaitMs(3, busy), 8000);
  assert.equal(retryWaitMs(20, busy), 30_000);
});

test("deleting what is already gone counts as done", () => {
  assert.equal(isAlreadyGone(gone), true);
  assert.equal(isAlreadyGone(network), false);
});

test("checks for the server slow down to every 30 seconds", () => {
  assert.equal(probeWaitMs(0), 2000);
  assert.equal(probeWaitMs(4), 30_000);
  assert.equal(probeWaitMs(99), 30_000);
});

test("ids made on the phone are distinct UUIDs", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newId()));
  assert.equal(ids.size, 500);
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
});
