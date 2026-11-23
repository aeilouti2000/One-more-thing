import assert from "node:assert/strict";
import { test } from "node:test";
import type { HomeHistory } from "@/features/homes/types/household";
import { chooseHistory, historyNow, keptFrom, longDate, readHistory, shortDate, shortens } from "./history-period";

const now = new Date(2026, 10, 24, 12);
const options = [3, 6, 12];
const plain = (months: number): HomeHistory => ({ chosen: months, months, pending: null, options });
const waiting: HomeHistory = {
  chosen: 3,
  months: 12,
  pending: { months: 3, from: new Date(2026, 11, 24, 12).toISOString() },
  options,
};

test("reads the server's history, or null from an older server", () => {
  assert.deepEqual(readHistory({ chosen: 3, months: 12, pending: { months: 3, from: "2026-12-24T00:00:00Z" }, options }), {
    chosen: 3,
    months: 12,
    pending: { months: 3, from: "2026-12-24T00:00:00Z" },
    options,
  });
  assert.equal(readHistory(undefined), null);
  assert.equal(readHistory({ chosen: 3 }), null);
  assert.deepEqual(readHistory({ chosen: 3, months: 3, pending: null, options: [3] })?.pending, null);
});

test("a waiting change applies on its date even without a new answer", () => {
  assert.deepEqual(historyNow(waiting, now), waiting);
  assert.deepEqual(historyNow(waiting, new Date(2026, 11, 25)), plain(3));
});

test("shortening keeps the period in force for 30 days", () => {
  const next = chooseHistory(plain(12), 3, now);
  assert.equal(next.chosen, 3);
  assert.equal(next.months, 12);
  assert.equal(next.pending?.months, 3);
  assert.equal(new Date(next.pending!.from).getTime(), now.getTime() + 30 * 86_400_000);
  assert.equal(shortens(plain(12), 3, now), true);
  assert.equal(shortens(plain(3), 12, now), false);
});

test("lengthening, and going back during the notice, apply at once", () => {
  assert.deepEqual(chooseHistory(plain(3), 6, now), plain(6));
  assert.deepEqual(chooseHistory(waiting, 12, now), plain(12));
  assert.equal(shortens(waiting, 12, now), false);
});

test("choosing the same period changes nothing", () => {
  assert.deepEqual(chooseHistory(waiting, 3, now), waiting);
  assert.equal(shortens(waiting, 3, now), false);
});

test("shortening again during a notice still waits from the period in force", () => {
  const next = chooseHistory({ ...waiting, chosen: 6, pending: { ...waiting.pending!, months: 6 } }, 3, now);
  assert.equal(next.months, 12);
  assert.equal(next.pending?.months, 3);
});

test("the first day kept: the first of the month of the date, minus the period", () => {
  assert.deepEqual(keptFrom(new Date(2026, 11, 24), 3), new Date(2026, 8, 1));
  assert.deepEqual(keptFrom(new Date(2027, 0, 5), 3), new Date(2026, 9, 1));
  assert.deepEqual(keptFrom(new Date(2026, 11, 24), 12), new Date(2025, 11, 1));
});

test("dates in the app's locale (as the other History dates), with the year only when it is another year", () => {
  assert.equal(shortDate(new Date(2026, 11, 24), "en", now), "Dec 24");
  assert.equal(longDate(new Date(2026, 8, 1), "en", now), "September 1");
  assert.equal(longDate(new Date(2025, 11, 1), "en", now), "December 1, 2025");
  assert.match(longDate(new Date(2026, 8, 1), "ar", now), /سبتمبر/);
});
