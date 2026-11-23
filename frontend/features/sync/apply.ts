import type { Purchase } from "@/features/items/types/purchase";
import type { HomeList } from "@/features/items/api/lists";
import { keepLocalPhotos } from "@/features/items/utils/optimistic";
import type { Product, Trip } from "@/features/sync/types";

/**
 * Pure merges of a changes answer into what the phone holds. A full answer
 * replaces; otherwise rows are put in place by id and deleted ids removed.
 * Anything bought before the window (start of last month) is dropped: the
 * phone keeps two months, older months load from the server when viewed.
 */

const byServerOrder = (a: Purchase, b: Purchase) =>
  (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || b.createdAt.localeCompare(a.createdAt);

function inWindow(item: Purchase, windowStartMs: number) {
  if (item.status !== "bought") return true;
  const at = Date.parse(item.boughtAt ?? item.createdAt);
  return !Number.isFinite(at) || at >= windowStartMs;
}

export function mergeItems(
  current: Purchase[] | undefined,
  incoming: Purchase[],
  options: { full: boolean; deletedIds: string[]; windowStart: string; lists?: HomeList[] },
): Purchase[] {
  const windowStartMs = Date.parse(options.windowStart);
  let merged: Purchase[];
  if (options.full || !current) {
    merged = keepLocalPhotos(incoming, current);
  } else {
    const byId = new Map(current.map((item) => [item.id, item]));
    for (const id of options.deletedIds) byId.delete(id);
    for (const item of keepLocalPhotos(incoming, current)) byId.set(item.id, item);
    merged = [...byId.values()];
  }
  // A renamed list: items carry its name, so they follow the list.
  const names = options.lists ? new Map(options.lists.map((list) => [list.id, list.name])) : null;
  if (names) {
    merged = merged.map((item) => {
      const name = item.listId ? names.get(item.listId) : undefined;
      return name !== undefined && name !== item.listName ? { ...item, listName: name } : item;
    });
  }
  return merged.filter((item) => inWindow(item, windowStartMs)).sort(byServerOrder);
}

export function mergeById<T extends { id: string }>(
  current: T[] | undefined,
  incoming: T[],
  options: { full: boolean; deletedIds: string[]; keep?: (row: T) => boolean },
): T[] {
  let merged: T[];
  if (options.full || !current) {
    merged = incoming;
  } else {
    const byId = new Map(current.map((row) => [row.id, row]));
    for (const id of options.deletedIds) byId.delete(id);
    for (const row of incoming) byId.set(row.id, row);
    merged = [...byId.values()];
  }
  return options.keep ? merged.filter(options.keep) : merged;
}

export function mergeTrips(current: Trip[] | undefined, incoming: Trip[], options: { full: boolean; deletedIds: string[]; windowStart: string }) {
  const windowStartMs = Date.parse(options.windowStart);
  return mergeById(current, incoming, {
    ...options,
    keep: (trip) => Date.parse(trip.lastBoughtAt) >= windowStartMs,
  }).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function mergeProducts(current: Product[] | undefined, incoming: Product[], options: { full: boolean; deletedIds: string[] }) {
  return mergeById(current, incoming, options);
}

/** The ids of one kind in a changes answer's deletions. */
export function deletedOf(deleted: { type: string; id: string }[] | undefined, type: string) {
  return (deleted ?? []).filter((row) => row.type === type).map((row) => row.id);
}
