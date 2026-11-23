import { describe, expect, it } from "@jest/globals";
import { summarizeMonth } from "./month-summary";

const row = (trip: string, total: number | null, category: string, items: number, priced: number, cost: number) => ({
  trip_id: trip,
  total,
  category,
  items,
  priced,
  cost_sum: cost,
});

describe("summarizeMonth", () => {
  it("adds items' own prices when the trip has no total", () => {
    const summary = summarizeMonth([row("t1", null, "meat", 2, 2, 10), row("t1", null, "vegetables", 3, 1, 1.5)]);
    expect(summary).toMatchObject({ itemCount: 5, pricedCount: 3, tripCount: 1, spend: 11.5 });
  });

  it("counts a trip total once and every item in it as priced", () => {
    const summary = summarizeMonth([
      row("t1", 20, "meat", 2, 1, 8),
      row("t1", 20, "vegetables", 3, 0, 0),
      row("t2", null, "coffee", 1, 1, 4.25),
    ]);
    expect(summary).toMatchObject({ itemCount: 6, pricedCount: 6, tripCount: 2, spend: 24.25 });
    expect(summary.categories).toEqual([
      { category: "", itemCount: 0, spend: 12 },
      { category: "meat", itemCount: 2, spend: 8 },
      { category: "coffee", itemCount: 1, spend: 4.25 },
      { category: "vegetables", itemCount: 3, spend: 0 },
    ]);
  });

  it("is empty for a month without purchases", () => {
    expect(summarizeMonth([])).toEqual({ itemCount: 0, pricedCount: 0, tripCount: 0, spend: 0, categories: [] });
  });
});
