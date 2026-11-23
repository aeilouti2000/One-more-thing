import "@/features/auth/utils/session-storage";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
  MutationCache,
  QueryClient,
  dehydrate,
  hydrate,
  type DehydratedState,
  type Mutation,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";
import { persistQueryClientSave, type PersistedClient } from "@tanstack/react-query-persist-client";
import { AppState } from "react-native";
import { keepsWaiting, retryWaitMs } from "@/features/offline/rules";
import { RowStore } from "@/features/offline/row-store";
import { openCacheDb } from "@/features/offline/sqlite-db";

/**
 * Everything the app has loaded (homes, lists, items, pins, sets) and every
 * change still waiting to be sent live in this TanStack Query client. It is
 * saved on the phone after each change and read back when the app starts, so
 * the app opens and keeps working with no internet.
 */
const STORAGE_KEY = "omt.query.v1";
const SESSION_KEY = "omt.session";
/** Saved by versions before this cache existed; read once, then removed. */
const LEGACY_PREFIX = "omt.profile.v1.";
/** A saved copy older than this is not trusted. */
const MAX_AGE_MS = 60 * 24 * 60 * 60_000;
const SAVE_WAIT_MS = 250;

type MutationHooks = {
  onSuccess?: (mutation: Mutation<unknown, unknown, unknown, unknown>, data: unknown) => void;
  onError?: (mutation: Mutation<unknown, unknown, unknown, unknown>, error: unknown) => void;
  onSettled?: (mutation: Mutation<unknown, unknown, unknown, unknown>) => void;
};

/** Filled in by the outbox, which is created after this client. */
export const mutationHooks: MutationHooks = {};

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: (data, _variables, _context, mutation) => mutationHooks.onSuccess?.(mutation, data),
    onError: (error, _variables, _context, mutation) => mutationHooks.onError?.(mutation, error),
    onSettled: (_data, _error, _variables, _context, mutation) => mutationHooks.onSettled?.(mutation),
  }),
  defaultOptions: {
    queries: {
      // The app decides when to load (focus, pull, a change elsewhere).
      networkMode: "always",
      retry: false,
      staleTime: Infinity,
      // Never dropped from memory: the saved copy is what works offline.
      gcTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      // Without a connection a change pauses and waits instead of failing.
      networkMode: "online",
    },
  },
});

/** Every change the app makes is a mutation under this key (see outbox.ts). */
export const OUTBOX_KEY = ["outbox"] as const;

/** How a waiting change is sent; filled in by the outbox when it loads. */
export const outboxRuntime: { run?: (entry: unknown) => Promise<unknown> } = {};

// Set before the saved changes are read back below: a change restored from the
// phone gets its way of being sent from these defaults.
queryClient.setMutationDefaults(OUTBOX_KEY, {
  // One at a time, in the order they were made.
  scope: { id: "omt-outbox" },
  mutationFn: (entry: unknown) =>
    outboxRuntime.run
      ? outboxRuntime.run(entry)
      : // Not loaded yet: reads as "no connection", so the change keeps waiting.
        Promise.reject(Object.assign(new Error("Outbox not loaded"), { code: "NETWORK" })),
  retry: (failures, error) => keepsWaiting(failures + 1, error),
  retryDelay: (failures, error) => retryWaitMs(failures, error),
});

const storage = {
  getItem(key: string) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    // Thrown on purpose: the persister counts a failed save.
    globalThis.localStorage.setItem(key, value);
  },
  removeItem(key: string) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Ignore storage failures while clearing.
    }
  },
};

const persister = createSyncStoragePersister({
  storage,
  key: STORAGE_KEY,
  throttleTime: SAVE_WAIT_MS,
});

/**
 * The saved copy in SQLite tables, one row per item (see row-store.ts). Null
 * when SQLite is not available (web, tests, or it failed to open): then the
 * single saved text below is used, as before.
 */
const rowStore: RowStore | null = (() => {
  const db = openCacheDb();
  if (!db) return null;
  try {
    return new RowStore(db);
  } catch {
    return null;
  }
})();

function storedUserId() {
  try {
    const raw = storage.getItem(SESSION_KEY);
    if (!raw) return null;
    return (JSON.parse(raw) as { user?: { id?: string } }).user?.id || null;
  } catch {
    return null;
  }
}

/** Whose data the cache holds. One person's lists are never shown to the next. */
let owner: string | null = storedUserId();

/**
 * What is written to the phone: everything loaded, and every change not yet
 * answered. That includes one on its way right now: if the app is closed
 * before the answer arrives, it is sent again next time.
 */
const WHAT_TO_SAVE = {
  shouldDehydrateQuery: (query: Query) => query.state.status === "success",
  shouldDehydrateMutation: (mutation: Mutation) => mutation.state.status === "pending",
};

function snapshot(): PersistedClient {
  return {
    buster: owner ?? "",
    timestamp: Date.now(),
    clientState: dehydrate(queryClient, WHAT_TO_SAVE),
  };
}

/** Entries changed since the last write to the tables (value undefined: removed). */
const dirty = new Map<string, { key: QueryKey; value: unknown }>();
let outboxDirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** True while the saved copy is being put back: those writes are not saved again. */
let restoring = false;

function savedMutations() {
  return dehydrate(queryClient, { shouldDehydrateQuery: () => false, shouldDehydrateMutation: WHAT_TO_SAVE.shouldDehydrateMutation })
    .mutations;
}

/** Writes what changed to the tables, now. */
function flushRows() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!rowStore || !owner || (dirty.size === 0 && !outboxDirty)) return;
  const changes = [...dirty.values()].map(({ key, value }) => ({ key: [...key], value }));
  dirty.clear();
  const mutations = outboxDirty ? savedMutations() : undefined;
  outboxDirty = false;
  try {
    rowStore.save(owner, changes, mutations);
  } catch {
    // The phone's storage failed: the in-memory copy still works, and the next
    // change tries again with everything.
    for (const change of changes) dirty.set(JSON.stringify(change.key), change);
    if (mutations) outboxDirty = true;
  }
}

function markDirty(key: QueryKey, value: unknown) {
  if (restoring) return;
  dirty.set(JSON.stringify(key), { key, value });
  if (!flushTimer) flushTimer = setTimeout(flushRows, SAVE_WAIT_MS);
}

function markOutboxDirty() {
  if (restoring) return;
  outboxDirty = true;
  if (!flushTimer) flushTimer = setTimeout(flushRows, SAVE_WAIT_MS);
}

function save() {
  if (!owner) return;
  if (rowStore) return;
  persistQueryClientSave({ queryClient, persister, buster: owner, dehydrateOptions: WHAT_TO_SAVE });
}

/** Writes now, without the short wait (the app is going to the background). */
function saveNow() {
  if (!owner) return;
  if (rowStore) return flushRows();
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
  } catch {
    // Storage is full or unavailable: the in-memory copy still works.
  }
}

type LegacySnapshot = {
  householdKnown?: boolean;
  household?: unknown;
  homes?: unknown[];
  items?: Record<string, unknown[]>;
  lists?: Record<string, unknown[]>;
  historyLists?: Record<string, unknown[]>;
  categories?: Record<string, unknown[]>;
  pins?: Record<string, unknown[]>;
  sets?: Record<string, unknown[]>;
};

/** Brings over what an older version saved, so the first start after the update works offline too. */
function adoptLegacyCache(userId: string) {
  const key = `${LEGACY_PREFIX}${userId}`;
  const raw = storage.getItem(key);
  if (!raw) return;
  try {
    const old = JSON.parse(raw) as LegacySnapshot;
    if (old.householdKnown) {
      queryClient.setQueryData(["household"], old.household ?? null);
      queryClient.setQueryData(["homes"], Array.isArray(old.homes) ? old.homes : []);
    }
    const groups: [string, Record<string, unknown[]> | undefined][] = [
      ["items", old.items],
      ["lists", old.lists],
      ["historyLists", old.historyLists],
      ["categories", old.categories],
      ["pins", old.pins],
      ["sets", old.sets],
    ];
    for (const [name, byHome] of groups) {
      for (const [homeId, rows] of Object.entries(byHome ?? {})) {
        if (Array.isArray(rows)) queryClient.setQueryData([name, homeId], rows);
      }
    }
  } catch {
    // An unreadable old copy is simply not used.
  }
  storage.removeItem(key);
}

/** Puts the copy saved in the tables back into memory. */
function restoreRows(store: RowStore) {
  let copy: ReturnType<RowStore["load"]>;
  try {
    copy = store.load();
  } catch {
    store.clear();
    return;
  }
  const usable = copy.owner === owner && Date.now() - copy.savedAt < MAX_AGE_MS;
  if (!usable) {
    if (copy.owner !== null) store.clear();
    return;
  }
  restoring = true;
  try {
    for (const entry of copy.entries) {
      queryClient.setQueryData(entry.key, entry.value);
      // The objects now in memory are the ones just read: the first change
      // after this writes only what really changed.
      store.adoptRestored(entry.key, queryClient.getQueryData(entry.key));
    }
    hydrate(queryClient, {
      queries: [],
      // Every saved change starts paused, so the queue sends them in order.
      mutations: (copy.mutations as DehydratedState["mutations"]).map((mutation) => ({
        ...mutation,
        state: { ...mutation.state, isPaused: true },
      })),
    });
  } catch {
    queryClient.clear();
    store.clear();
  } finally {
    restoring = false;
  }
}

/**
 * The first start with tables: what an older version saved as one text is put
 * back, written into the tables in full, and only then removed.
 */
function moveTextCopyToRows(store: RowStore) {
  if (!owner || storage.getItem(STORAGE_KEY) === null) return false;
  restoreFromText();
  try {
    const entries = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.status === "success" && query.state.data !== undefined)
      .map((query) => ({ key: [...query.queryKey], value: query.state.data }));
    store.save(owner, entries, savedMutations());
    for (const entry of entries) store.adoptRestored(entry.key, entry.value);
    persister.removeClient();
  } catch {
    // Kept as text: the next start tries again.
  }
  return true;
}

function restore() {
  if (!owner) return;
  if (rowStore) {
    if (!moveTextCopyToRows(rowStore)) restoreRows(rowStore);
    return;
  }
  restoreFromText();
}

/** The single saved text (older versions; web; when SQLite is not available). */
function restoreFromText() {
  if (!owner) return;
  let saved: PersistedClient | undefined;
  try {
    saved = persister.restoreClient() as PersistedClient | undefined;
  } catch {
    saved = undefined;
  }
  const usable =
    saved &&
    saved.buster === owner &&
    typeof saved.timestamp === "number" &&
    Date.now() - saved.timestamp < MAX_AGE_MS;
  if (!usable || !saved) {
    if (saved) persister.removeClient();
    adoptLegacyCache(owner);
    return;
  }
  const state: DehydratedState = {
    queries: saved.clientState.queries ?? [],
    // Every saved change starts paused, so the queue sends them in order.
    mutations: (saved.clientState.mutations ?? []).map((mutation) => ({
      ...mutation,
      state: { ...mutation.state, isPaused: true },
    })),
  };
  try {
    hydrate(queryClient, state);
  } catch {
    queryClient.clear();
    persister.removeClient();
  }
}

restore();

// Saved again whenever what is on the phone changes. A reload that brings the
// same data (the trip screen asks every few seconds) writes nothing.
const lastData = new WeakMap<Query, unknown>();
queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "removed") {
    if (rowStore) markDirty(event.query.queryKey, undefined);
    return save();
  }
  if (event.type !== "added" && event.type !== "updated") return;
  const data = event.query.state.data;
  if (lastData.get(event.query) === data) return;
  lastData.set(event.query, data);
  if (data === undefined) return;
  if (rowStore) markDirty(event.query.queryKey, data);
  save();
});
queryClient.getMutationCache().subscribe((event) => {
  if (event.type === "added" || event.type === "removed" || event.type === "updated") {
    if (rowStore) markOutboxDirty();
    save();
  }
});
AppState.addEventListener("change", (state) => {
  if (state !== "active") saveNow();
});
// Lets waiting changes continue when the connection returns, also when no
// screen is mounted (the widget's background run).
queryClient.mount();

/** Called when the signed-in person changes (sign-in, sign-out, session ended). */
export function setCacheOwner(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  dirty.clear();
  outboxDirty = false;
  queryClient.clear();
  persister.removeClient();
  rowStore?.clear();
  if (userId) adoptLegacyCache(userId);
}

/** Forgets everything saved on this phone for the signed-in person. */
export function clearOfflineData() {
  dirty.clear();
  outboxDirty = false;
  queryClient.clear();
  persister.removeClient();
  rowStore?.clear();
  const userId = owner ?? storedUserId();
  if (userId) storage.removeItem(`${LEGACY_PREFIX}${userId}`);
}

/** The saved copy of something, or undefined when it was never loaded. */
export function readCache<T>(key: QueryKey): T | undefined {
  return queryClient.getQueryData<T>(key);
}

export function writeCache<T>(key: QueryKey, value: T | ((current: T | undefined) => T | undefined)) {
  queryClient.setQueryData<T>(key, value as never);
}

/** Query keys, in one place. */
export const qk = {
  household: () => ["household"] as const,
  homes: () => ["homes"] as const,
  items: (homeId: string) => ["items", homeId] as const,
  lists: (homeId: string) => ["lists", homeId] as const,
  historyLists: (homeId: string) => ["historyLists", homeId] as const,
  categories: (homeId: string) => ["categories", homeId] as const,
  pins: (homeId: string) => ["pins", homeId] as const,
  sets: (homeId: string) => ["sets", homeId] as const,
  /** Version and window of the last sync, saved with the copy it describes (see features/sync). */
  syncState: (homeId: string) => ["syncState", homeId] as const,
  products: (homeId: string) => ["products", homeId] as const,
  trips: (homeId: string) => ["trips", homeId] as const,
  icons: (homeId: string) => ["icons", homeId] as const,
  locks: (homeId: string) => ["locks", homeId] as const,
  notificationPrefs: () => ["notificationPrefs"] as const,
};
