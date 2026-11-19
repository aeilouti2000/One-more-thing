import assert from "node:assert/strict";
import { test } from "node:test";
import { laterInDays, laterNextMonth, laterNextWeek, laterTomorrow } from "./later-dates";

const stamp = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:00`;

test("later days land on the morning of the right local day", () => {
  const evening = new Date(2026, 10, 19, 23, 30);
  assert.equal(stamp(laterTomorrow(evening)), "2026-11-20 6:00");
  assert.equal(stamp(laterNextWeek(evening)), "2026-11-26 6:00");
  assert.equal(stamp(laterNextMonth(evening)), "2026-12-1 6:00");
});

test("later days roll over months and years, and stay within a year", () => {
  assert.equal(stamp(laterTomorrow(new Date(2026, 10, 30, 12))), "2026-12-1 6:00");
  assert.equal(stamp(laterNextMonth(new Date(2026, 11, 31, 12))), "2027-1-1 6:00");
  assert.equal(stamp(laterInDays(0, new Date(2026, 10, 19, 12))), "2026-11-20 6:00");
  assert.equal(stamp(laterInDays(9999, new Date(2026, 10, 19, 12))), "2027-11-19 6:00");
});
