import assert from "node:assert/strict";
import { test } from "node:test";
import type { Purchase } from "@/features/items/types/purchase";
import {
  addMonths,
  collectAllPages,
  dayKey,
  dayRows,
  mergePages,
  monthOptions,
  stepMonth,
  unpricedCount,
} from "@/features/items/utils/history";

function bought(id: string, at: Date, extra: Partial<Purchase> = {}): Purchase {
  return {
    id,
    name: id,
    quantity: 1,
    category: "other",
    status: "bought",
    urgent: false,
    addedByName: "Sara",
    createdAt: at.toISOString(),
    boughtAt: at.toISOString(),
    ...extra,
  };
}

const day = (d: number, h = 12) => new Date(2026, 10, d, h, 0, 0);

test("months: newest first, the current one always offered, future months never", () => {
  assert.deepEqual(monthOptions(["2026-09", "2026-11", "2026-10"], "2026-11"), ["2026-11", "2026-10", "2026-09"]);
  // Nothing bought yet this month: still offered (History opens on it).
  assert.deepEqual(monthOptions(["2026-10", "2026-07"], "2026-11"), ["2026-11", "2026-10", "2026-07"]);
  // Never loaded (offline on a new phone): this month and the last.
  assert.deepEqual(monthOptions(undefined, "2026-01"), ["2026-01", "2025-12"]);
  // A phone whose clock is behind the server's month.
  assert.deepEqual(monthOptions(["2026-12", "2026-11"], "2026-11"), ["2026-11"]);
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(addMonths("2026-12", 1), "2027-01");
});

test("month arrows step through the offered months and stop at both ends", () => {
  const options = ["2026-11", "2026-10", "2026-07"];
  assert.equal(stepMonth(options, "2026-11", "older"), "2026-10");
  // A gap (Aug, Sep empty) is skipped.
  assert.equal(stepMonth(options, "2026-10", "older"), "2026-07");
  assert.equal(stepMonth(options, "2026-07", "older"), null);
  assert.equal(stepMonth(options, "2026-11", "newer"), null);
  assert.equal(stepMonth(options, "2026-07", "newer"), "2026-10");
  // A month that is no longer offered goes to its nearest neighbour.
  assert.equal(stepMonth(options, "2026-09", "older"), "2026-07");
  assert.equal(stepMonth(options, "2026-09", "newer"), "2026-10");
});

test("cursor pages join in order, without showing a row twice", () => {
  const pages = [
    [{ id: "a" }, { id: "b" }],
    [{ id: "b" }, { id: "c" }],
    [],
    [{ id: "d" }],
  ];
  assert.deepEqual(mergePages(pages, (row) => row.id).map((row) => row.id), ["a", "b", "c", "d"]);
  assert.deepEqual(mergePages(undefined, (row: { id: string }) => row.id), []);
});

test("purchases are grouped by day, newest first", () => {
  const rows = dayRows(
    [bought("1", day(23, 18)), bought("2", day(23, 9)), bought("3", day(21))],
    { hasMore: false, totals: true },
  );
  assert.deepEqual(
    rows.map((row) => (row.type === "day" ? `day ${row.day}` : row.key)),
    ["day 2026-11-23", "1", "2", "day 2026-11-21", "3"],
  );
  assert.equal(dayKey(day(5).toISOString()), "2026-11-05");
});

test("a day's total shows only once all of its rows are loaded", () => {
  const items = [
    bought("1", day(23), { cost: 2 }),
    bought("2", day(23), { cost: 3.5 }),
    bought("3", day(22), { cost: 1 }),
  ];
  const partial = dayRows(items, { hasMore: true, totals: true }).filter((row) => row.type === "day");
  // The 23rd is complete (the 22nd has started); the 22nd may go on next page.
  assert.deepEqual(partial.map((row) => row.type === "day" && row.total), [5.5, null]);
  const whole = dayRows(items, { hasMore: false, totals: true }).filter((row) => row.type === "day");
  assert.deepEqual(whole.map((row) => row.type === "day" && row.total), [5.5, 1]);
  const off = dayRows(items, { hasMore: false, totals: false }).filter((row) => row.type === "day");
  assert.deepEqual(off.map((row) => row.type === "day" && row.total), [null, null]);
});

test("a trip saved with one total counts it once, on its first day", () => {
  const trip = { receiptId: "t1", receiptTotal: 10 };
  const rows = dayRows(
    [
      bought("1", day(23, 0), { ...trip, cost: 4 }),
      bought("2", day(22, 23), { ...trip }),
      bought("3", day(22, 20), { cost: 1.25 }),
    ],
    { hasMore: false, totals: true },
  ).filter((row) => row.type === "day");
  assert.deepEqual(rows.map((row) => row.type === "day" && row.total), [10, 1.25]);
});

test("CSV paging reads every page, and stops on a repeated or endless cursor", async () => {
  const pages: Record<string, { items: number[]; next: string | null }> = {
    start: { items: [1, 2], next: "p2" },
    p2: { items: [3, 4], next: "p3" },
    p3: { items: [5], next: null },
  };
  const asked: (string | null)[] = [];
  const all = await collectAllPages(async (before) => {
    asked.push(before);
    return pages[before ?? "start"];
  });
  assert.deepEqual(all, [1, 2, 3, 4, 5]);
  assert.deepEqual(asked, [null, "p2", "p3"]);

  let calls = 0;
  const endless = await collectAllPages(async () => {
    calls += 1;
    return { items: [calls], next: `c${calls}` };
  }, 5);
  assert.equal(endless.length, 5);

  const stuck = await collectAllPages(async (before) => ({ items: [0], next: before ?? "same" }));
  assert.equal(stuck.length, 2);
});

test("unpriced items are counted only for trips without a total", () => {
  assert.equal(unpricedCount({ hasTotal: false, itemCount: 5, pricedCount: 3 }), 2);
  assert.equal(unpricedCount({ hasTotal: true, itemCount: 5, pricedCount: 5 }), 0);
});
