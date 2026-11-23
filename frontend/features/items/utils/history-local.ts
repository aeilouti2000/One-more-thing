import type { HistoryTrip, MonthStats } from "@/features/items/api/history";
import type { Purchase } from "@/features/items/types/purchase";
import { summarizeSpend } from "@/features/items/utils/currency";
import { groupPurchasesIntoTrips, monthOf } from "@/features/items/utils/trips";

/**
 * This month and last month are always on the phone (the saved items), so
 * History can show them offline even before the server's pages for them
 * were ever loaded. A purchase belongs to the month its trip started, as on
 * the server.
 */
function tripsOfMonth(bought: readonly Purchase[], month: string) {
  return groupPurchasesIntoTrips(bought.filter((item) => item.status === "bought")).filter(
    (trip) => monthOf(trip.startedAt) === month,
  );
}

const newestFirst = (a: Purchase, b: Purchase) =>
  (b.boughtAt ?? b.createdAt).localeCompare(a.boughtAt ?? a.createdAt) || b.id.localeCompare(a.id);

export function localPurchases(
  bought: readonly Purchase[],
  month: string,
  filter: { listId: string | null; category: string | null },
) {
  return tripsOfMonth(bought, month)
    .flatMap((trip) => trip.items)
    .filter(
      (item) =>
        (!filter.listId || item.listId === filter.listId) && (!filter.category || item.category === filter.category),
    )
    .sort(newestFirst);
}

export function localTrips(bought: readonly Purchase[], month: string, listId: string | null): HistoryTrip[] {
  return tripsOfMonth(bought, month)
    .filter((trip) => !listId || trip.items[0]?.listId === listId)
    .map((trip) => {
      const oldestFirst = [...trip.items].reverse();
      const hasTotal = trip.items.some((item) => item.receiptId && typeof item.receiptTotal === "number");
      return {
        id: trip.id,
        name: trip.name,
        listId: trip.items[0]?.listId ?? null,
        listName: trip.listName || null,
        startedAt: trip.startedAt,
        lastBoughtAt: trip.items[0]?.boughtAt ?? trip.startedAt,
        total: trip.total,
        hasTotal,
        itemCount: trip.count,
        pricedCount: trip.priced,
        itemsTotal: trip.items.reduce((sum, item) => sum + (item.cost ?? 0), 0),
        preview: oldestFirst.slice(0, 3).map((item) => ({
          name: item.name,
          category: item.category,
          imageId: item.imageId ?? null,
        })),
      };
    });
}

/** The trip's items as the phone has them (an offline trip detail). */
export function localTripItems(bought: readonly Purchase[], tripId: string) {
  const trip = groupPurchasesIntoTrips(bought.filter((item) => item.status === "bought")).find(
    (entry) => entry.id === tripId,
  );
  return trip ?? null;
}

/** Month totals from the saved items, by the same spend rule; categories by item price. */
export function localStats(bought: readonly Purchase[], month: string, budget: number | null): MonthStats {
  const trips = tripsOfMonth(bought, month);
  const items = trips.flatMap((trip) => trip.items);
  const spend = summarizeSpend(items);
  const byCategory = new Map<string, { itemCount: number; spend: number }>();
  for (const item of items) {
    const entry = byCategory.get(item.category) ?? { itemCount: 0, spend: 0 };
    entry.itemCount += 1;
    entry.spend += item.cost ?? 0;
    byCategory.set(item.category, entry);
  }
  const itemSpend = [...byCategory.values()].reduce((sum, entry) => sum + entry.spend, 0);
  const categories = [...byCategory.entries()].map(([category, entry]) => ({ category, ...entry }));
  // The part of trip totals no item price explains ("Trip totals").
  if (spend.total - itemSpend > 0.0005) {
    categories.push({ category: "", itemCount: 0, spend: Math.round((spend.total - itemSpend) * 1000) / 1000 });
  }
  return {
    month,
    state: items.length > 0 ? "live" : "none",
    itemCount: items.length,
    pricedCount: spend.priced,
    tripCount: trips.length,
    spend: Math.round(spend.total * 1000) / 1000,
    categories,
    budget,
  };
}
