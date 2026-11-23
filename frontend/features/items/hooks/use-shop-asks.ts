import { useCallback, useEffect, useSyncExternalStore } from "react";
import { isOpenAsk, type ShopAsk } from "@/features/items/api/shop-asks";
import { onListChanged } from "@/features/items/utils/list-sync";
import { qk, readCache, writeCache } from "@/features/offline/query-client";
import { onSynced, requireFullSync, syncHome } from "@/features/sync/engine";

/**
 * The home's open "Anything missing?" questions, shared by the list (which
 * shows a question to answer) and the trip (which shows the answers).
 *
 * Kept outside React so both screens read one copy and one request serves
 * both. A refresh that isn't forced is skipped when the last one is recent:
 * the list changes often (every tick of a trip), the questions rarely.
 */
const MIN_REFRESH_GAP_MS = 10_000;
const NONE: ShopAsk[] = [];

type State = { homeId: string | null; asks: ShopAsk[] };

let state: State = { homeId: null, asks: NONE };
/** When the last successful check finished. */
let lastFetchAt = 0;
/** The check on its way, and the home it is for. */
let inflight: { homeId: string; run: Promise<void> } | null = null;
/**
 * Goes up with every change made here (an answer just given, a question
 * ended). A check that started before it would put the older state back.
 */
let localVersion = 0;
/** When the last change was made here; a sync that left before it is older. */
let lastLocalChangeAt = 0;
const listeners = new Set<() => void>();

/** The questions the last sync brought for a home (kept with the saved copy). */
function savedAsks(homeId: string) {
  const asks = (readCache<ShopAsk[]>(qk.asks(homeId)) ?? []).filter((ask) => isOpenAsk(ask));
  return asks.length ? asks : NONE;
}

function publish(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function sameAsks(a: ShopAsk[], b: ShopAsk[]) {
  return a.length === b.length && JSON.stringify(a) === JSON.stringify(b);
}

export function refreshShopAsks(homeId: string, options?: { force?: boolean }): Promise<void> {
  if (state.homeId !== homeId) {
    // After a restart or a home switch the sync may answer "nothing changed":
    // start from what the last sync saved.
    publish({ homeId, asks: savedAsks(homeId) });
    lastFetchAt = 0;
  }
  // A check for this home is already on its way; one for another home (the
  // home was just switched) is left to finish and be thrown away.
  if (inflight?.homeId === homeId) return inflight.run;
  if (!options?.force && Date.now() - lastFetchAt < MIN_REFRESH_GAP_MS) return Promise.resolve();

  const run = (async () => {
    // The questions come with the home's sync (see onSynced below).
    const result = await syncHome(homeId);
    // A failed check keeps what is on screen, and the next one may try at once.
    if (result.offline || result.error || state.homeId !== homeId) return;
    lastFetchAt = Date.now();
    // Questions end by time, not by a change: drop the ones that ended.
    const open = state.asks.filter((ask) => isOpenAsk(ask));
    if (open.length !== state.asks.length) publish({ homeId, asks: open.length ? open : NONE });
  })().finally(() => {
    if (inflight?.run === run) inflight = null;
  });
  inflight = { homeId, run };
  return run;
}

/**
 * Every sync that changed something carries the home's open questions. One
 * that left before a change made here (an answer just given) is older: it is
 * not shown, and a fresh copy is asked for.
 */
onSynced((homeId, answer, startedAt) => {
  if (!answer.asks || state.homeId !== homeId) return;
  if (startedAt < lastLocalChangeAt) {
    // Older than what was just done here, but it may carry a partner's answer:
    // ask again for a full copy instead of showing or dropping it.
    requireFullSync();
    void syncHome(homeId);
    return;
  }
  const open = answer.asks.filter((ask) => isOpenAsk(ask));
  if (!sameAsks(open, state.asks)) publish({ homeId, asks: open.length ? open : NONE });
});

/** The same, but only when that home is the one on screen (a notification may be about another). */
export function refreshShopAsksIfShown(homeId: string) {
  if (state.homeId === homeId) void refreshShopAsks(homeId, { force: true });
}

/** Puts a fresh answer from the server on screen without another request. */
export function adoptShopAsk(ask: ShopAsk) {
  if (state.homeId !== ask.homeId) return;
  localVersion += 1;
  lastLocalChangeAt = Date.now();
  const rest = state.asks.filter((entry) => entry.id !== ask.id);
  const next = isOpenAsk(ask) ? [ask, ...rest] : rest;
  writeCache<ShopAsk[]>(qk.asks(ask.homeId), next);
  publish({ homeId: state.homeId, asks: next });
}

export function dropShopAsk(askId: string) {
  if (!state.asks.some((ask) => ask.id === askId)) return;
  localVersion += 1;
  lastLocalChangeAt = Date.now();
  const rest = state.asks.filter((ask) => ask.id !== askId);
  if (state.homeId) writeCache<ShopAsk[]>(qk.asks(state.homeId), rest);
  publish({ homeId: state.homeId, asks: rest.length ? rest : NONE });
}

/** Signed out, or someone else signed in: their questions are not this person's. */
export function resetShopAsks() {
  localVersion += 1;
  lastFetchAt = 0;
  if (state.homeId !== null || state.asks !== NONE) publish({ homeId: null, asks: NONE });
}

/**
 * `enabled` is false for a home of one, or when the home turned asking off:
 * then nothing is requested at all.
 */
export function useShopAsks(homeId: string | null, enabled: boolean) {
  const current = useSyncExternalStore(subscribe, () => state, () => state);

  const refresh = useCallback(
    (force = false) => {
      if (!homeId || !enabled) return;
      void refreshShopAsks(homeId, { force });
    },
    [enabled, homeId],
  );

  useEffect(() => {
    refresh();
    return onListChanged(() => refresh());
  }, [refresh]);

  const asks = enabled && current.homeId === homeId ? current.asks : NONE;
  return { asks, refresh };
}
