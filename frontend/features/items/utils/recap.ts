import type { Purchase } from "@/features/items/types/purchase";
import {
  boughtInMonth,
  currentMonth,
  normalizeName,
  previousMonth,
  summarizeMonth,
  TRIP_TOTALS,
} from "@/features/items/utils/insights";
import { groupPurchasesIntoTrips } from "@/features/items/utils/trips";

/** A price has to rise at least this much to be worth a line (5%). */
const MIN_RISE = 0.05;
/** The recap card is offered for this many days after a month ends. */
export const RECAP_CARD_DAYS = 7;

export type MonthRecap = {
  month: string;
  /** Items bought in the month. */
  items: number;
  trips: number;
  total: number;
  /** At least one price or invoice total was entered. */
  priced: boolean;
  previousTotal: number;
  /** Percent more (+) or less (−) than the month before; null without both totals. */
  change: number | null;
  /** The item bought most often, when something was bought at least twice. */
  mostBought: { name: string; times: number } | null;
  /** Where the largest share of the itemised spending went. */
  topCategory: { category: string; share: number } | null;
  /** The most expensive trip, when there was more than one priced trip. */
  biggestTrip: { total: number; name: string | null } | null;
  /** The item whose price per unit rose the most since it was last bought. */
  priceRise: { name: string; percent: number } | null;
  /** Who did the trips, most first (a trip belongs to whoever bought most of it). */
  shoppers: { id: string | null; name: string; trips: number }[];
};

function boughtMs(item: Purchase) {
  const ms = new Date(item.boughtAt ?? item.createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function unitKey(item: Purchase) {
  return (item.unit ?? "").trim().toLowerCase();
}

/** Price of one unit, when the item has its own price. */
function unitPrice(item: Purchase) {
  if (typeof item.cost !== "number" || !Number.isFinite(item.cost) || item.cost <= 0) return null;
  if (!(item.quantity > 0)) return null;
  return item.cost / item.quantity;
}

function mostBought(items: Purchase[]): MonthRecap["mostBought"] {
  const counts = new Map<string, { name: string; times: number; at: number }>();
  for (const item of items) {
    const key = normalizeName(item.name);
    if (!key) continue;
    const at = boughtMs(item);
    const seen = counts.get(key);
    if (!seen) counts.set(key, { name: item.name.trim(), times: 1, at });
    else {
      seen.times += 1;
      // Shown the way it was last written.
      if (at > seen.at) {
        seen.at = at;
        seen.name = item.name.trim();
      }
    }
  }
  let best: { name: string; times: number; at: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.times > best.times || (entry.times === best.times && entry.at > best.at)) {
      best = entry;
    }
  }
  return best && best.times >= 2 ? { name: best.name, times: best.times } : null;
}

/**
 * For each item bought (and priced) in the month: its last price there against
 * the purchase before it, same unit. The biggest rise wins.
 */
function biggestPriceRise(all: Purchase[], month: Purchase[]): MonthRecap["priceRise"] {
  const latest = new Map<string, Purchase>();
  for (const item of month) {
    if (unitPrice(item) === null) continue;
    const key = `${normalizeName(item.name)}\0${unitKey(item)}`;
    const seen = latest.get(key);
    if (!seen || boughtMs(item) > boughtMs(seen)) latest.set(key, item);
  }
  if (latest.size === 0) return null;

  // One pass over history: the newest priced purchase older than each "latest".
  const before = new Map<string, Purchase>();
  for (const item of all) {
    if (item.status !== "bought" || unitPrice(item) === null) continue;
    const key = `${normalizeName(item.name)}\0${unitKey(item)}`;
    const current = latest.get(key);
    if (!current || item.id === current.id || boughtMs(item) >= boughtMs(current)) continue;
    const seen = before.get(key);
    if (!seen || boughtMs(item) > boughtMs(seen)) before.set(key, item);
  }

  let best: { name: string; percent: number } | null = null;
  for (const [key, current] of latest) {
    const earlier = before.get(key);
    if (!earlier) continue;
    const now = unitPrice(current) as number;
    const then = unitPrice(earlier) as number;
    const rise = (now - then) / then;
    if (rise < MIN_RISE) continue;
    const percent = Math.round(rise * 100);
    if (!best || percent > best.percent) best = { name: current.name.trim(), percent };
  }
  return best;
}

/** Everything the recap screen shows for one calendar month ("2026-10"). */
export function summarizeRecap(purchases: Purchase[], month: string): MonthRecap {
  const items = boughtInMonth(purchases, month);
  const summary = summarizeMonth(purchases, month);
  const previousTotal = summarizeMonth(purchases, previousMonth(month)).total;
  const trips = groupPurchasesIntoTrips(items);
  const priced = summary.total > 0 || summary.unpriced < summary.count;

  const itemised = summary.byCategory.filter((row) => row.category !== TRIP_TOTALS);
  const itemisedTotal = itemised.reduce((sum, row) => sum + row.total, 0);
  const top = itemised[0];

  const pricedTrips = trips.filter((trip) => trip.total > 0);
  const biggest = pricedTrips.reduce<(typeof pricedTrips)[number] | null>(
    (best, trip) => (!best || trip.total > best.total ? trip : best),
    null,
  );

  const byShopper = new Map<string, { id: string | null; name: string; trips: number }>();
  for (const trip of trips) {
    const tally = new Map<string, { id: string | null; name: string; count: number }>();
    for (const item of trip.items) {
      const name = item.boughtByName?.trim();
      if (!name) continue;
      const key = item.boughtById ?? name;
      const entry = tally.get(key) ?? { id: item.boughtById ?? null, name, count: 0 };
      entry.count += 1;
      tally.set(key, entry);
    }
    let lead: { id: string | null; name: string; count: number } | null = null;
    for (const entry of tally.values()) if (!lead || entry.count > lead.count) lead = entry;
    if (!lead) continue;
    const key = lead.id ?? lead.name;
    const shopper = byShopper.get(key) ?? { id: lead.id, name: lead.name, trips: 0 };
    shopper.trips += 1;
    byShopper.set(key, shopper);
  }

  return {
    month,
    items: items.length,
    trips: trips.length,
    total: summary.total,
    priced,
    previousTotal,
    change:
      summary.total > 0 && previousTotal > 0
        ? Math.round(((summary.total - previousTotal) / previousTotal) * 100)
        : null,
    mostBought: mostBought(items),
    topCategory:
      top && itemisedTotal > 0 ? { category: top.category, share: top.total / itemisedTotal } : null,
    biggestTrip:
      biggest && pricedTrips.length > 1 ? { total: biggest.total, name: biggest.name } : null,
    priceRise: biggestPriceRise(purchases, items),
    shoppers: [...byShopper.values()].sort(
      (a, b) => b.trips - a.trips || a.name.localeCompare(b.name),
    ),
  };
}

/**
 * The month whose recap card History offers now: the one that just ended,
 * during the first days of a new month. Null the rest of the time.
 */
export function recapMonthToOffer(now = new Date()): string | null {
  if (now.getDate() > RECAP_CARD_DAYS) return null;
  return previousMonth(currentMonth(now));
}
