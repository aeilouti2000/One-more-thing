import { useCallback, useEffect, useSyncExternalStore } from "react";
import { fetchShopAsks, isOpenAsk, type ShopAsk } from "@/features/items/api/shop-asks";
import { onListChanged } from "@/features/items/utils/list-sync";

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
const listeners = new Set<() => void>();

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
    publish({ homeId, asks: NONE });
    lastFetchAt = 0;
  }
  // A check for this home is already on its way; one for another home (the
  // home was just switched) is left to finish and be thrown away.
  if (inflight?.homeId === homeId) return inflight.run;
  if (!options?.force && Date.now() - lastFetchAt < MIN_REFRESH_GAP_MS) return Promise.resolve();

  const seen = localVersion;
  const run = (async () => {
    const result = await fetchShopAsks(homeId);
    // A failed check keeps what is on screen, and the next one may try at once.
    if (!result.asks || state.homeId !== homeId) return;
    lastFetchAt = Date.now();
    // Something changed here while it was on its way: its answer is older.
    if (seen !== localVersion) return;
    const open = result.asks.filter((ask) => isOpenAsk(ask));
    if (!sameAsks(open, state.asks)) publish({ homeId, asks: open.length ? open : NONE });
  })().finally(() => {
    if (inflight?.run === run) inflight = null;
  });
  inflight = { homeId, run };
  return run;
}

/** The same, but only when that home is the one on screen (a notification may be about another). */
export function refreshShopAsksIfShown(homeId: string) {
  if (state.homeId === homeId) void refreshShopAsks(homeId, { force: true });
}

/** Puts a fresh answer from the server on screen without another request. */
export function adoptShopAsk(ask: ShopAsk) {
  if (state.homeId !== ask.homeId) return;
  localVersion += 1;
  const rest = state.asks.filter((entry) => entry.id !== ask.id);
  publish({ homeId: state.homeId, asks: isOpenAsk(ask) ? [ask, ...rest] : rest });
}

export function dropShopAsk(askId: string) {
  if (!state.asks.some((ask) => ask.id === askId)) return;
  localVersion += 1;
  const rest = state.asks.filter((ask) => ask.id !== askId);
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
