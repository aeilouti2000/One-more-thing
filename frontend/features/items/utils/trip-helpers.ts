import { summarizeSpend } from "@/features/items/utils/currency";
import { normalizeName } from "@/features/items/utils/insights";
import type { Purchase } from "@/features/items/types/purchase";

function boughtMs(item: Purchase) {
  const ms = new Date(item.boughtAt ?? item.createdAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Shop names used on earlier trips, newest first, each once (ignoring case).
 * While typing, only names that contain the text, never the exact text itself.
 */
export function savedShopNames(purchases: Purchase[], query = "", limit = 6): string[] {
  const typed = normalizeName(query);
  const newest = new Map<string, { name: string; at: number }>();
  for (const item of purchases) {
    const name = item.receiptName?.trim();
    if (item.status !== "bought" || !name) continue;
    const key = normalizeName(name);
    const at = boughtMs(item);
    const seen = newest.get(key);
    if (!seen || at > seen.at) newest.set(key, { name, at });
  }
  return [...newest.entries()]
    .filter(([key]) => !typed || (key !== typed && key.includes(typed)))
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, limit)
    .map(([, entry]) => entry.name);
}

/** Last price paid for each item name (normalized), from priced purchases. */
export function lastPrices(purchases: Purchase[]): Map<string, number> {
  const best = new Map<string, { cost: number; at: number }>();
  for (const item of purchases) {
    if (item.status !== "bought") continue;
    if (typeof item.cost !== "number" || !Number.isFinite(item.cost) || item.cost <= 0) continue;
    const key = normalizeName(item.name);
    if (!key) continue;
    const at = boughtMs(item);
    const seen = best.get(key);
    if (!seen || at > seen.at) best.set(key, { cost: item.cost, at });
  }
  return new Map([...best.entries()].map(([key, entry]) => [key, entry.cost]));
}

export function priceOf(prices: Map<string, number>, name: string): number | null {
  return prices.get(normalizeName(name)) ?? null;
}

/** Items bought on this trip's list (by anyone) since the trip started. */
export function tripDoneItems(
  bought: Purchase[],
  scope: { listId: string | null; category: string | null; startedAt: number },
): Purchase[] {
  // A little slack: the phone's clock and the server's can differ a bit.
  const from = scope.startedAt - 5000;
  return bought.filter((item) => {
    if (scope.listId && item.listId !== scope.listId) return false;
    if (scope.category && item.category !== scope.category) return false;
    return boughtMs(item) >= from;
  });
}

/**
 * Progress for the card at the top of a trip. The estimate is the real price
 * where one was entered, else the last price paid; unknown prices add nothing.
 */
export function tripProgress(
  done: Purchase[],
  remaining: number,
  prices: Map<string, number>,
) {
  let estimate = 0;
  let estimated = 0;
  for (const item of done) {
    const own = typeof item.cost === "number" && Number.isFinite(item.cost) ? item.cost : null;
    const amount = own ?? priceOf(prices, item.name);
    if (amount === null) continue;
    estimate += amount;
    estimated += 1;
  }
  return {
    done: done.length,
    total: done.length + remaining,
    estimate: Math.round(estimate * 1000) / 1000,
    /** How many of the done items have a price (real or last). */
    estimated,
  };
}

export type TripSummary = {
  shopName: string | null;
  partners: string[];
  bought: number;
  left: number;
  total: number;
  /** How many items the total covers; 0 means no prices at all. */
  priced: number;
  minutes: number;
  notFound: string[];
};

export function summarizeTrip(input: {
  done: Purchase[];
  left: number;
  notFound: string[];
  startedAt: number;
  endedAt: number;
  partners: string[];
}): TripSummary {
  const spend = summarizeSpend(input.done);
  const shopName =
    input.done.map((item) => item.receiptName?.trim()).find((name): name is string => Boolean(name)) ??
    null;
  return {
    shopName,
    partners: input.partners,
    bought: input.done.length,
    left: input.left,
    total: spend.total,
    priced: spend.priced,
    minutes: Math.max(1, Math.round((input.endedAt - input.startedAt) / 60_000)),
    notFound: input.notFound,
  };
}

/** "38 min", "1 h 5 min": labels come from i18n so Arabic reads right. */
export function formatTripMinutes(
  minutes: number,
  labels: { minutes: (value: number) => string; hours: (hours: number, minutes: number) => string },
) {
  if (minutes < 60) return labels.minutes(minutes);
  return labels.hours(Math.floor(minutes / 60), minutes % 60);
}

/** Plain text for the summary's Share button. */
export function formatTripShare(
  summary: TripSummary,
  labels: {
    title: string;
    bought: string;
    left: string;
    total: string | null;
    time: string;
    notFound: string | null;
  },
) {
  const lines = [summary.shopName ? `${labels.title} · ${summary.shopName}` : labels.title];
  lines.push(labels.bought, labels.left);
  if (labels.total) lines.push(labels.total);
  lines.push(labels.time);
  if (labels.notFound) lines.push(labels.notFound);
  return lines.join("\n");
}
