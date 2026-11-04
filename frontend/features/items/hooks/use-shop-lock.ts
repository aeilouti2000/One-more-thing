import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import {
  fetchShopLock,
  SHOP_LOCK_POLL_MS,
  type ShopLock,
} from "@/features/items/api/shop-locks";

/**
 * Polls the per-list shopping lock so other members see when someone is on a trip.
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

  const refresh = useCallback(async () => {
    const home = homeIdRef.current;
    const list = listIdRef.current;
    if (!home || !list) return null;
    const result = await fetchShopLock(home, list);
    if (homeIdRef.current !== home || listIdRef.current !== list) return null;
    if (result.lock) setStored({ key: `${home}:${list}`, lock: result.lock });
    return result.lock;
  }, []);

  useEffect(() => {
    if (!enabled || !homeId || !listId) return;

    let cancelled = false;
    void (async () => {
      const result = await fetchShopLock(homeId, listId);
      if (cancelled) return;
      if (result.lock) setStored({ key: `${homeId}:${listId}`, lock: result.lock });
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
  }, [enabled, homeId, listId, refresh]);

  const blockedByOther = Boolean(lock?.active && !lock.isMine);

  return { lock, blockedByOther, refresh };
}
