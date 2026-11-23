/**
 * A month's totals from its trips, by the rule the app has always used
 * (frontend/features/items/utils/currency.ts, summarizeSpend):
 *
 * - A trip with a total counts that total once, and all its items as priced.
 * - Any other item counts its own price, when it has one.
 *
 * Per category, an item in a trip with a total counts its own price if it has
 * one; the rest of that trip's total is reported under the category "" (shown
 * as "Trip totals").
 */
export type TripCategoryRow = {
  trip_id: string;
  total: string | number | null;
  category: string;
  items: string | number;
  priced: string | number;
  cost_sum: string | number;
};

export type MonthSummary = {
  itemCount: number;
  pricedCount: number;
  tripCount: number;
  spend: number;
  categories: { category: string; itemCount: number; spend: number }[];
};

const round = (value: number) => Math.round(value * 1000) / 1000;

export function summarizeMonth(rows: TripCategoryRow[]): MonthSummary {
  const trips = new Map<string, { total: number | null; ownCosts: number }>();
  const categories = new Map<string, { itemCount: number; spend: number }>();
  let itemCount = 0;
  let pricedCount = 0;
  let looseSpend = 0;

  for (const row of rows) {
    const total = row.total === null ? null : Number(row.total);
    const items = Number(row.items);
    const costSum = Number(row.cost_sum);
    const trip = trips.get(row.trip_id) ?? { total, ownCosts: 0 };
    trip.ownCosts += costSum;
    trips.set(row.trip_id, trip);

    itemCount += items;
    pricedCount += total !== null ? items : Number(row.priced);
    if (total === null) looseSpend += costSum;

    const category = categories.get(row.category) ?? { itemCount: 0, spend: 0 };
    category.itemCount += items;
    category.spend += costSum;
    categories.set(row.category, category);
  }

  let tripTotals = 0;
  let remainder = 0;
  for (const trip of trips.values()) {
    if (trip.total === null) continue;
    tripTotals += trip.total;
    remainder += Math.max(trip.total - trip.ownCosts, 0);
  }
  if (remainder > 0) categories.set("", { itemCount: 0, spend: remainder });

  return {
    itemCount,
    pricedCount,
    tripCount: trips.size,
    spend: round(tripTotals + looseSpend),
    categories: [...categories]
      .map(([category, value]) => ({ category, itemCount: value.itemCount, spend: round(value.spend) }))
      .sort((a, b) => b.spend - a.spend),
  };
}
