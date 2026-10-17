import { sumKnownCosts } from "@/features/items/utils/currency";
import type { Purchase } from "@/features/items/types/purchase";

const TRIP_GAP_MS = 90 * 60 * 1000;

export type ShoppingTrip = {
  id: string;
  listName: string;
  startedAt: string;
  items: Purchase[];
  total: number;
  priced: number;
  count: number;
};

export function groupPurchasesIntoTrips(items: Purchase[]): ShoppingTrip[] {
  const byList = new Map<string, Purchase[]>();
  for (const item of items) {
    const key = item.listId ?? "";
    const bucket = byList.get(key) ?? [];
    bucket.push(item);
    byList.set(key, bucket);
  }

  const trips: ShoppingTrip[] = [];
  for (const bucket of byList.values()) {
    const ordered = [...bucket].sort((a, b) => boughtMs(a) - boughtMs(b));
    let current: Purchase[] = [];
    for (const item of ordered) {
      const previous = current[current.length - 1];
      const gap = previous ? boughtMs(item) - boughtMs(previous) : 0;
      if (previous && gap >= 0 && gap <= TRIP_GAP_MS) {
        current.push(item);
      } else {
        if (current.length > 0) trips.push(toTrip(current));
        current = [item];
      }
    }
    if (current.length > 0) trips.push(toTrip(current));
  }

  return trips.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function toTrip(items: Purchase[]): ShoppingTrip {
  const ordered = [...items].sort((a, b) => boughtMs(a) - boughtMs(b));
  const first = ordered[0];
  const spend = sumKnownCosts(ordered.map((item) => item.cost));
  return {
    id: first?.id ?? "",
    listName: first?.listName ?? "",
    startedAt: first?.boughtAt ?? first?.createdAt ?? "",
    items: [...ordered].sort((a, b) => boughtMs(b) - boughtMs(a)),
    total: spend.total,
    priced: spend.priced,
    count: ordered.length,
  };
}

function boughtMs(item: Purchase) {
  const value = item.boughtAt ?? item.createdAt;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}
