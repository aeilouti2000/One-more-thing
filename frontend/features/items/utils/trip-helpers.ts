import { summarizeSpend } from "@/features/items/utils/currency";
import {
  normalizeName,
  priceFor,
  type PricedLine,
  type PriceTarget,
} from "@/features/items/utils/insights";
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

/** Last priced purchase of each item name (normalized). */
export function lastPrices(purchases: Purchase[]): Map<string, PricedLine> {
  const best = new Map<string, { line: PricedLine; at: number }>();
  for (const item of purchases) {
    if (item.status !== "bought") continue;
    if (typeof item.cost !== "number" || !Number.isFinite(item.cost) || item.cost <= 0) continue;
    const key = normalizeName(item.name);
    if (!key) continue;
    const at = boughtMs(item);
    const seen = best.get(key);
    if (!seen || at > seen.at) {
      best.set(key, { line: { cost: item.cost, quantity: item.quantity, unit: item.unit }, at });
    }
  }
  return new Map([...best.entries()].map(([key, entry]) => [key, entry.line]));
}

/**
 * The remembered price for a line: pieces and packs are priced for the line's
 * quantity, anything else keeps the whole price it was last bought at.
 */
export function rememberedPrice(
  prices: Map<string, PricedLine>,
  name: string,
  target?: PriceTarget,
): { cost: number; each: number | null } | null {
  const last = prices.get(normalizeName(name));
  return last ? priceFor(last, target) : null;
}

export function priceOf(
  prices: Map<string, PricedLine>,
  name: string,
  target?: PriceTarget,
): number | null {
  return rememberedPrice(prices, name, target)?.cost ?? null;
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
 * Progress for the card at the top of a trip.
 *
 * `estimate` is what is in the basket so far: the real price where one was
 * entered, else the last price paid. `expected` adds the last price of what is
 * still to buy, so it is what the whole trip should cost. Items never priced
 * add nothing and are counted in `unpriced`.
 */
export function tripProgress(
  done: Purchase[],
  remaining: Purchase[],
  prices: Map<string, PricedLine>,
) {
  let estimate = 0;
  let estimated = 0;
  let recorded = 0;
  for (const item of done) {
    const own = typeof item.cost === "number" && Number.isFinite(item.cost) ? item.cost : null;
    const amount = own ?? priceOf(prices, item.name, item);
    if (amount === null) continue;
    estimate += amount;
    estimated += 1;
    if (own !== null) recorded += own;
  }
  let ahead = 0;
  let aheadPriced = 0;
  for (const item of remaining) {
    const amount = priceOf(prices, item.name, item);
    if (amount === null) continue;
    ahead += amount;
    aheadPriced += 1;
  }
  return {
    done: done.length,
    total: done.length + remaining.length,
    estimate: roundMoney(estimate),
    /** How many of the done items have a price (real or last). */
    estimated,
    /** Basket so far plus the last prices of what is still to buy. */
    expected: roundMoney(estimate + ahead),
    /** The part of `estimate` that is real, entered prices (already in the month's spending). */
    recorded: roundMoney(recorded),
    /** Items, bought or still to buy, that have no price to go by. */
    unpriced: done.length - estimated + (remaining.length - aheadPriced),
  };
}

function roundMoney(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Share of the budget at which the trip card starts to warn (same as History). */
export const BUDGET_WARN_AT = 0.8;

/**
 * What a trip leaves of the month's budget. `monthSpent` already holds the
 * real prices entered on this trip (`recorded`), so only the rest of the
 * expected total is added on top.
 */
export function tripBudget(input: {
  budget: number | null | undefined;
  monthSpent: number;
  expected: number;
  recorded: number;
}): { left: number; tone: "ok" | "warn" | "over" } | null {
  const { budget } = input;
  if (!budget || budget <= 0) return null;
  const spentAfter = input.monthSpent + Math.max(0, input.expected - input.recorded);
  const left = roundMoney(budget - spentAfter);
  const tone = left < 0 ? "over" : spentAfter / budget >= BUDGET_WARN_AT ? "warn" : "ok";
  return { left, tone };
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
