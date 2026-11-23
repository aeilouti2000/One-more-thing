import { useEffect, useRef } from "react";
import { historyKeys } from "@/features/items/api/history";
import { isOnline, onOnlineChange } from "@/features/offline/network";
import { OUTBOX_KEY, queryClient } from "@/features/offline/query-client";

/** Several changes in a row (a trip priced item by item) make one reload. */
const SETTLE_MS = 400;
/** Opening History reloads what it shows at most this often. */
const FOCUS_RELOAD_MS = 60_000;

/**
 * Keeps History in step with the server. History pages are answers from the
 * server, so a change made anywhere (undo, a price, a rename, a partner's
 * purchase arriving by sync) is not in them until they are asked again:
 *
 * - a change sent by this phone, or a change to the home's items on the
 *   phone, marks the home's History out of date;
 * - while History is on screen and online, what it shows is asked again at once;
 * - otherwise it is asked when History comes back on screen.
 *
 * Offline nothing is asked: the saved pages stay as they are.
 */
export function useHistoryFreshness(homeId: string | null, focused: boolean) {
  const focusedRef = useRef(focused);
  const lastReload = useRef(0);
  useEffect(() => {
    focusedRef.current = focused;
  });

  useEffect(() => {
    if (!homeId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const key = historyKeys.all(homeId);
    const reload = () => {
      timer = null;
      const now = focusedRef.current && isOnline();
      if (now) lastReload.current = Date.now();
      void queryClient.invalidateQueries({ queryKey: key, refetchType: now ? "active" : "none" });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(reload, SETTLE_MS);
    };
    const stopMutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      const mutationKey = event.mutation.options.mutationKey;
      if (mutationKey?.[0] === OUTBOX_KEY[0]) schedule();
    });
    // A reload that brings the same items (structural sharing keeps the same
    // object) changes nothing.
    let lastItems: unknown = queryClient.getQueryData(["items", homeId]);
    const stopQueries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success") return;
      const queryKey = event.query.queryKey;
      if (queryKey[0] !== "items" || queryKey[1] !== homeId) return;
      if (event.query.state.data === lastItems) return;
      lastItems = event.query.state.data;
      schedule();
    });
    // Back online: what went out of date meanwhile is asked again.
    const stopOnline = onOnlineChange((online) => {
      if (online && focusedRef.current) {
        void queryClient.refetchQueries({ queryKey: key, type: "active", stale: true });
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
      stopMutations();
      stopQueries();
      stopOnline();
    };
  }, [homeId]);

  useEffect(() => {
    if (!homeId || !focused || !isOnline()) return;
    const key = historyKeys.all(homeId);
    if (Date.now() - lastReload.current > FOCUS_RELOAD_MS) {
      // Saved pages are shown at once and replaced when the answers arrive.
      lastReload.current = Date.now();
      void queryClient.invalidateQueries({ queryKey: key, refetchType: "active" });
    } else {
      void queryClient.refetchQueries({ queryKey: key, type: "active", stale: true });
    }
  }, [focused, homeId]);
}

/** After a change made from History: ask again now (when online). */
export function reloadHistory(homeId: string | null) {
  if (!homeId) return;
  void queryClient.invalidateQueries({
    queryKey: historyKeys.all(homeId),
    refetchType: isOnline() ? "active" : "none",
  });
}
