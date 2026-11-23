import type { Purchase } from "@/features/items/types/purchase";

/**
 * The pure parts of History: months, pages, day groups. Kept apart from the
 * screens so `node --test` can check them.
 */

/** "YYYY-MM" of a moment, on this phone's clock. */
export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function addMonths(month: string, delta: number) {
  const [year, index] = month.split("-").map(Number);
  return monthKey(new Date(year, index - 1 + delta, 1));
}

/**
 * The months the controls offer, newest first: every month the server has
 * anything for, and always the current one (History opens on it). Before the
 * list was ever loaded (offline on a new phone): this month and the last.
 */
export function monthOptions(serverMonths: readonly string[] | undefined, current: string) {
  const months = new Set(serverMonths ?? [addMonths(current, -1)]);
  months.add(current);
  return [...months].filter((month) => month <= current).sort((a, b) => b.localeCompare(a));
}

/** The month before or after `selected` in the offered list; null at either end. */
export function stepMonth(options: readonly string[], selected: string, direction: "older" | "newer") {
  const index = options.indexOf(selected);
  if (index < 0) {
    // Not offered (removed meanwhile): the nearest offered month that way.
    const sorted = [...options].sort((a, b) => b.localeCompare(a));
    return direction === "older"
      ? (sorted.find((month) => month < selected) ?? null)
      : ([...sorted].reverse().find((month) => month > selected) ?? null);
  }
  const next = direction === "older" ? index + 1 : index - 1;
  return options[next] ?? null;
}

/**
 * Pages read by cursor, joined into one list. A row is never shown twice,
 * even if a purchase moved between two reads.
 */
export function mergePages<T>(pages: readonly (readonly T[])[] | undefined, id: (row: T) => string): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const page of pages ?? []) {
    for (const row of page) {
      const key = id(row);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
  }
  return rows;
}

/** "YYYY-MM-DD" of a purchase, on this phone's clock. */
export function dayKey(iso: string | undefined) {
  const date = new Date(iso ?? "");
  if (Number.isNaN(date.getTime())) return "";
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, "0")}`;
}

export type DayRow = {
  type: "day";
  key: string;
  day: string;
  /** null until every purchase of the day is loaded (or when totals are off). */
  total: number | null;
};
export type PurchaseItemRow = { type: "item"; key: string; purchase: Purchase };

/**
 * The rows of the purchases list: a header before each day, then its
 * purchases (newest first, as the server sends them).
 *
 * A day's total would be wrong while some of its purchases are still on the
 * next page, so it is shown only once the day is complete: a later (older)
 * day has started, or there is no next page. A trip with one total counts it
 * once, on the first day it appears (the rule of summarizeSpend).
 */
export function dayRows(
  purchases: readonly Purchase[],
  options: { hasMore: boolean; totals: boolean },
): (DayRow | PurchaseItemRow)[] {
  const groups: { day: string; items: Purchase[] }[] = [];
  for (const purchase of purchases) {
    const day = dayKey(purchase.boughtAt ?? purchase.createdAt);
    const last = groups.at(-1);
    if (last && last.day === day) last.items.push(purchase);
    else groups.push({ day, items: [purchase] });
  }
  const countedTrips = new Set<string>();
  const rows: (DayRow | PurchaseItemRow)[] = [];
  groups.forEach((group, index) => {
    const complete = index < groups.length - 1 || !options.hasMore;
    let total = 0;
    for (const item of group.items) {
      const tripTotal = item.receiptTotal;
      if (item.receiptId && typeof tripTotal === "number" && Number.isFinite(tripTotal)) {
        if (!countedTrips.has(item.receiptId)) {
          countedTrips.add(item.receiptId);
          total += tripTotal;
        }
      } else if (typeof item.cost === "number" && Number.isFinite(item.cost)) {
        total += item.cost;
      }
    }
    rows.push({
      type: "day",
      // A day can appear twice in search results (different months): keep keys unique.
      key: `day:${group.day}:${index}`,
      day: group.day,
      total: options.totals && complete ? Math.round(total * 1000) / 1000 : null,
    });
    for (const purchase of group.items) rows.push({ type: "item", key: purchase.id, purchase });
  });
  return rows;
}

/**
 * Reads every page of a cursor-paged list (the CSV of a month). Stops at
 * `maxPages` so a server that keeps answering "next" cannot loop forever.
 */
export async function collectAllPages<T>(
  fetchPage: (before: string | null) => Promise<{ items: T[]; next: string | null }>,
  maxPages = 200,
): Promise<T[]> {
  const rows: T[] = [];
  let before: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const answer: { items: T[]; next: string | null } = await fetchPage(before);
    rows.push(...answer.items);
    if (!answer.next || answer.next === before) break;
    before = answer.next;
  }
  return rows;
}

/** How many of a trip's items have no price (none when the trip has a total). */
export function unpricedCount(trip: { hasTotal: boolean; itemCount: number; pricedCount: number }) {
  return trip.hasTotal ? 0 : Math.max(0, trip.itemCount - trip.pricedCount);
}
