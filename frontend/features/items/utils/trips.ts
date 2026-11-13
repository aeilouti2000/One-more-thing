import { summarizeSpend } from "@/features/items/utils/currency";
import type { Purchase } from "@/features/items/types/purchase";

const TRIP_GAP_MS = 90 * 60 * 1000;

export type ShoppingTrip = {
  id: string;
  /** The invoice behind this trip, once it has one. */
  receiptId: string | null;
  /** Name given to the invoice (e.g. the shop). */
  name: string | null;
  listName: string;
  startedAt: string;
  items: Purchase[];
  total: number;
  priced: number;
  count: number;
};

export function groupPurchasesIntoTrips(items: Purchase[]): ShoppingTrip[] {
  const trips: ShoppingTrip[] = [];

  // Items saved under one trip total are exactly one trip.
  const byReceipt = new Map<string, Purchase[]>();
  const loose: Purchase[] = [];
  for (const item of items) {
    if (item.receiptId) {
      const bucket = byReceipt.get(item.receiptId) ?? [];
      bucket.push(item);
      byReceipt.set(item.receiptId, bucket);
    } else {
      loose.push(item);
    }
  }
  for (const bucket of byReceipt.values()) trips.push(toTrip(bucket));

  const byList = new Map<string, Purchase[]>();
  for (const item of loose) {
    const key = item.listId ?? "";
    const bucket = byList.get(key) ?? [];
    bucket.push(item);
    byList.set(key, bucket);
  }

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
  const spend = summarizeSpend(ordered);
  const receiptId = first?.receiptId ?? null;
  return {
    id: receiptId ?? first?.id ?? "",
    receiptId,
    name: first?.receiptName?.trim() || null,
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

/** Calendar month (local time) of an ISO date, e.g. "2026-11". */
export function monthOf(value: string | undefined | null) {
  const date = new Date(value ?? "");
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * The invoice an item bought outside a trip should join: the most recent one
 * this month on the same list. Null when there's none.
 */
export function latestInvoiceThisMonth(
  items: Purchase[],
  now = new Date(),
  listId?: string | null,
): string | null {
  const month = monthOf(now.toISOString());
  let best: { id: string; at: number } | null = null;
  for (const item of items) {
    if (item.status !== "bought" || !item.receiptId) continue;
    if (listId !== undefined && (item.listId ?? null) !== (listId ?? null)) continue;
    const at = boughtMs(item);
    if (monthOf(item.boughtAt ?? item.createdAt) !== month) continue;
    if (!best || at > best.at) best = { id: item.receiptId, at };
  }
  return best?.id ?? null;
}

/** Other trips an item can move to: same month, not its own trip. */
export function moveTargets(trips: ShoppingTrip[], item: Purchase): ShoppingTrip[] {
  const month = monthOf(item.boughtAt ?? item.createdAt);
  return trips.filter(
    (trip) => !trip.items.some((entry) => entry.id === item.id) && monthOf(trip.startedAt) === month,
  );
}

/**
 * Where each invoice sits in History: the date and list of its first item.
 * Filters use this for every item of the invoice, so an invoice is shown (and
 * its total counted) whole, never split across days or lists.
 */
export function invoiceAnchors(items: Purchase[]) {
  const anchors = new Map<string, Purchase>();
  for (const item of items) {
    if (!item.receiptId) continue;
    const current = anchors.get(item.receiptId);
    if (!current || boughtMs(item) < boughtMs(current)) anchors.set(item.receiptId, item);
  }
  return anchors;
}
