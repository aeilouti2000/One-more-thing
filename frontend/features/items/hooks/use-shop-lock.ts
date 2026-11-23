import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { SHOP_LOCK_POLL_MS, type ShopLock } from "@/features/items/api/shop-locks";
import { qk, readCache } from "@/features/offline/query-client";
import { syncHome } from "@/features/sync/engine";

/**
 * Who is shopping a list, from the locks the last sync brought. A list missing
 * there has nobody on it.
 */
export function lockFromSync(homeId: string, listId: string): ShopLock {
  const locks = readCache<ShopLock[]>(qk.locks(homeId)) ?? [];
  return (
    locks.find((lock) => lock.listId === listId) ?? {
      listId,
      active: false,
      shopperId: null,
      shopperName: null,
      isMine: false,
      shoppers: [],
    }
  );
}

/**
 * Keeps the per-list shopping lock fresh so other members see when someone is
 * on a trip. It rides on the home's sync (one request for the list, the lock
 * and the questions), every few seconds while shown.
 * No-ops when the home has a single member.
 */
export function useShopLock(options: {
  homeId: string | null | undefined;
  listId: string | null | undefined;
  enabled: boolean;
}) {
  const { homeId, listId, enabled } = options;
  // Remember which list a lock belongs to, so switching lists never shows the
  // previous list's lock while the new one loads.
  const [stored, setStored] = useState<{ key: string; lock: ShopLock } | null>(null);
  const homeIdRef = useRef(homeId);
  const listIdRef = useRef(listId);
  useLayoutEffect(() => {
    homeIdRef.current = homeId;
    listIdRef.current = listId;
  });
  const currentKey = enabled && homeId && listId ? `${homeId}:${listId}` : null;
  const lock = currentKey && stored?.key === currentKey ? stored.lock : null;

  /** Same answer as last time: keep the old object, so nothing re-renders. */
  const store = useCallback((key: string, next: ShopLock) => {
    setStored((current) =>
      current && current.key === key && JSON.stringify(current.lock) === JSON.stringify(next)
        ? current
        : { key, lock: next },
    );
  }, []);

  const refresh = useCallback(async () => {
    const home = homeIdRef.current;
    const list = listIdRef.current;
    if (!home || !list) return null;
    const result = await syncHome(home);
    if (homeIdRef.current !== home || listIdRef.current !== list) return null;
    // Offline, the last known lock may be stale: keep what is shown.
    if (result.offline || result.error) return null;
    const lock = lockFromSync(home, list);
    store(`${home}:${list}`, lock);
    return lock;
  }, [store]);

  useEffect(() => {
    if (!enabled || !homeId || !listId) return;

    let cancelled = false;
    // What the last sync knew, at once; then a fresh look.
    if (readCache(qk.locks(homeId))) store(`${homeId}:${listId}`, lockFromSync(homeId, listId));
    void (async () => {
      await refresh();
      if (cancelled) return;
    })();

    const timer = setInterval(() => {
      if (AppState.currentState !== "active") return;
      void refresh();
    }, SHOP_LOCK_POLL_MS);

    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });

    return () => {
      cancelled = true;
      clearInterval(timer);
      appSub.remove();
    };
  }, [enabled, homeId, listId, refresh, store]);

  // A home that shops together never blocks: everyone can join the trip.
  const blockedByOther = Boolean(lock?.active && !lock.isMine && !lock.together);

  return { lock, blockedByOther, refresh };
}
