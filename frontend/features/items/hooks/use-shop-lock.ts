import { useCallback, useEffect, useRef, useState } from "react";
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
  const [lock, setLock] = useState<ShopLock | null>(null);
  const homeIdRef = useRef(homeId);
  const listIdRef = useRef(listId);
  homeIdRef.current = homeId;
  listIdRef.current = listId;

  const refresh = useCallback(async () => {
    const home = homeIdRef.current;
    const list = listIdRef.current;
    if (!home || !list) {
      setLock(null);
      return null;
    }
    const result = await fetchShopLock(home, list);
    if (homeIdRef.current !== home || listIdRef.current !== list) return null;
    if (result.lock) setLock(result.lock);
    return result.lock;
  }, []);

  useEffect(() => {
    if (!enabled || !homeId || !listId) {
      setLock(null);
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await fetchShopLock(homeId, listId);
      if (cancelled) return;
      if (result.lock) setLock(result.lock);
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
