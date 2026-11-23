import type { HomeSummary, Household } from "@/features/homes/types/household";
import type { Purchase } from "@/features/items/types/purchase";
import { qk, readCache, writeCache } from "@/features/offline/query-client";

/**
 * Plain read/write access to the copy saved on this phone (the TanStack Query
 * cache), for code that is not a React hook: the screens' first render, the
 * widgets, the background run.
 */
export type CachedHousehold = {
  household: Household | null;
  homes: HomeSummary[];
};

function list<T>(value: T[] | undefined): T[] | null {
  return Array.isArray(value) ? value : null;
}

/** Null when it was never loaded; `household: null` means "known to have no home". */
export function readCachedHousehold(): CachedHousehold | null {
  const household = readCache<Household | null>(qk.household());
  if (household === undefined) return null;
  return { household, homes: readCache<HomeSummary[]>(qk.homes()) ?? [] };
}

export function writeCachedHousehold(household: Household | null, homes?: HomeSummary[]) {
  writeCache<Household | null>(qk.household(), household);
  if (!household) writeCache<HomeSummary[]>(qk.homes(), []);
  else if (homes) writeCache<HomeSummary[]>(qk.homes(), homes);
}

export function writeCachedHomes(homes: HomeSummary[]) {
  writeCache<HomeSummary[]>(qk.homes(), homes);
}

export function readCachedItems(homeId: string): Purchase[] | null {
  return list(readCache<Purchase[]>(qk.items(homeId)));
}

export function writeCachedItems(homeId: string, items: Purchase[]) {
  writeCache<Purchase[]>(qk.items(homeId), items);
}

export function readCachedLists<T>(homeId: string): T[] | null {
  return list(readCache<T[]>(qk.lists(homeId)));
}

export function writeCachedLists<T>(homeId: string, lists: T[]) {
  writeCache<T[]>(qk.lists(homeId), lists);
}

export function readCachedHistoryLists<T>(homeId: string): T[] | null {
  return list(readCache<T[]>(qk.historyLists(homeId)));
}

export function readCachedCategories<T>(homeId: string): T[] | null {
  return list(readCache<T[]>(qk.categories(homeId)));
}

export function readCachedPins<T>(homeId: string): T[] | null {
  return list(readCache<T[]>(qk.pins(homeId)));
}

export function readCachedSets<T>(homeId: string): T[] | null {
  return list(readCache<T[]>(qk.sets(homeId)));
}
