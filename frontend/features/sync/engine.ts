import { toPurchase } from "@/features/items/api/items";
import type { HomeCategory } from "@/features/items/api/categories";
import type { HomeList } from "@/features/items/api/lists";
import { toPin, type Pin } from "@/features/items/api/pins";
import { toSet, type ItemSet } from "@/features/items/api/sets";
import type { ShopAsk } from "@/features/items/api/shop-asks";
import type { ShopLock } from "@/features/items/api/shop-locks";
import type { Purchase } from "@/features/items/types/purchase";
import { isOnline, probeNow } from "@/features/offline/network";
import { changeEpoch, hasPending, noteStaleRead } from "@/features/offline/outbox";
import { cacheOwner, qk, queryClient, readCache, writeCache } from "@/features/offline/query-client";
import { deletedOf, mergeItems, mergeProducts, mergeTrips } from "@/features/sync/apply";
import type { ChangesAnswer, HomeIconRow, Product, SyncState, Trip } from "@/features/sync/types";
import { api, ApiError } from "@/lib/api";
import { formatAppError, isOfflineError } from "@/lib/errors";

export type SyncResult = {
  /** Something on this phone changed. */
  changed: boolean;
  /** The server could not be reached; the saved copy is what is shown. */
  offline: boolean;
  error: string | null;
};

const QUIET: SyncResult = { changed: false, offline: false, error: null };

/** Parts of an answer that live outside the query cache (questions). `startedAt`: when the request left. */
type SyncListener = (homeId: string, answer: ChangesAnswer, startedAt: number) => void;
const listeners = new Set<SyncListener>();

/** Called with every answer that changed something. Returns the unsubscribe. */
export function onSynced(listener: SyncListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const inflight = new Map<string, Promise<SyncResult>>();
const again = new Set<string>();

/**
 * Set when this phone's copy may differ from the server in a way no change
 * will ever correct: a change shown here was refused there. The next sync then
 * asks for a full copy instead of "what changed", which puts every row right.
 */
let fullCopyNeeded = false;

export function requireFullSync() {
  fullCopyNeeded = true;
}

// Any change the server refused (sent at once or after waiting offline).
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "updated" && event.mutation.state.status === "error") requireFullSync();
});

/**
 * Brings this phone's copy of a home up to date: asks the server what changed
 * since the version last seen and writes it into the saved copy, in the same
 * shapes the screens already read. Calls made while one is on its way share
 * it, and one more runs after it (a change may have been made meanwhile).
 */
export function syncHome(homeId: string): Promise<SyncResult> {
  const running = inflight.get(homeId);
  if (running) {
    again.add(homeId);
    return running;
  }
  const run = (async () => {
    let result: SyncResult;
    do {
      again.delete(homeId);
      result = await syncOnce(homeId);
    } while (again.has(homeId));
    return result;
  })().finally(() => {
    if (inflight.get(homeId) === run) inflight.delete(homeId);
  });
  inflight.set(homeId, run);
  return run;
}

function timezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

async function syncOnce(homeId: string): Promise<SyncResult> {
  const hasCopy = readCache<Purchase[]>(qk.items(homeId)) !== undefined;
  // A change made on this phone is still waiting: the server does not have it
  // yet, and its answer would take it off the screen. The outbox syncs after.
  if (hasPending() && hasCopy) {
    noteStaleRead();
    return { ...QUIET, offline: !isOnline() };
  }
  if (!isOnline() && hasCopy) {
    void probeNow();
    return { ...QUIET, offline: true };
  }

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const state = readCache<SyncState>(qk.syncState(homeId));
    const full = fullCopyNeeded;
    // The version is trusted only together with the copy it describes.
    const since =
      !full && state && readCache<Purchase[]>(qk.items(homeId)) !== undefined ? state.version : null;
    const started = changeEpoch();
    const startedAt = Date.now();
    const owner = cacheOwner();
    let answer: ChangesAnswer;
    try {
      const zone = timezone();
      answer = await api.get<ChangesAnswer>(
        `/homes/${homeId}/changes${since === null ? "" : `?since=${since}`}`,
        true,
        zone ? { "X-Timezone": zone } : undefined,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.code !== "HOME_NOT_FOUND") {
        return legacyLoad(homeId);
      }
      return { changed: false, offline: isOfflineError(error), error: isOfflineError(error) ? null : formatAppError(error) };
    }
    // Signed out, or someone else signed in, while this was on its way.
    if (cacheOwner() !== owner) return QUIET;
    if (hasPending() && readCache(qk.items(homeId)) !== undefined) {
      noteStaleRead();
      return QUIET;
    }
    // A change was made and saved while this was on its way: ask once more.
    if (changeEpoch() !== started && attempt === 0) continue;
    if (answer.items === undefined) return QUIET;
    applyAnswer(homeId, answer);
    if (full && answer.full) fullCopyNeeded = false;
    for (const listener of listeners) listener(homeId, answer, startedAt);
    return { changed: true, offline: false, error: null };
  }
  return QUIET;
}

/** Writes an answer into the saved copy. Exported for tests. */
export function applyAnswer(homeId: string, answer: ChangesAnswer) {
  const full = answer.full;
  const windowStart = answer.windowStart ?? new Date(0).toISOString();
  const deleted = answer.deleted;

  writeCache<Purchase[]>(qk.items(homeId), (current) =>
    mergeItems(current, (answer.items ?? []).map(toPurchase), {
      full,
      deletedIds: deletedOf(deleted, "item"),
      windowStart,
      lists: answer.lists,
    }),
  );
  writeCache<Product[]>(qk.products(homeId), (current) =>
    mergeProducts(current, answer.products ?? [], { full, deletedIds: deletedOf(deleted, "product") }),
  );
  writeCache<Trip[]>(qk.trips(homeId), (current) =>
    mergeTrips(current, answer.trips ?? [], { full, deletedIds: deletedOf(deleted, "trip"), windowStart }),
  );
  // Small sets come whole with every answer that changed something.
  if (answer.lists) writeCache<HomeList[]>(qk.lists(homeId), answer.lists);
  if (answer.categories) writeCache<HomeCategory[]>(qk.categories(homeId), answer.categories);
  if (answer.pins) writeCache<Pin[]>(qk.pins(homeId), answer.pins.map(toPin));
  if (answer.sets) writeCache<ItemSet[]>(qk.sets(homeId), answer.sets.map(toSet));
  if (answer.icons) writeCache<HomeIconRow[]>(qk.icons(homeId), answer.icons);
  if (answer.locks) writeCache<ShopLock[]>(qk.locks(homeId), answer.locks);
  if (answer.asks) writeCache<ShopAsk[]>(qk.asks(homeId), answer.asks);
  writeCache<SyncState>(qk.syncState(homeId), { version: answer.version, windowStart });
}

/** A server from before the changes endpoint: load the whole list, as before. */
async function legacyLoad(homeId: string): Promise<SyncResult> {
  try {
    const rows = await api.get<Parameters<typeof toPurchase>[0][]>(`/homes/${homeId}/items`);
    if (hasPending()) return QUIET;
    writeCache<Purchase[]>(qk.items(homeId), rows.map(toPurchase));
    return { changed: true, offline: false, error: null };
  } catch (error) {
    return { changed: false, offline: isOfflineError(error), error: isOfflineError(error) ? null : formatAppError(error) };
  }
}

/** The questions in the last answer (they live in their own store, see use-shop-asks). */
export function asksOf(answer: ChangesAnswer): ShopAsk[] | undefined {
  return answer.asks;
}

/**
 * What the items screen calls to refresh: syncs, then answers with the saved
 * copy (shown even when the server could not be reached).
 */
export async function loadHomeItems(homeId: string) {
  const result = await syncHome(homeId);
  const items = readCache<Purchase[]>(qk.items(homeId));
  return { items: items ?? ([] as Purchase[]), error: result.error, offline: result.offline };
}
