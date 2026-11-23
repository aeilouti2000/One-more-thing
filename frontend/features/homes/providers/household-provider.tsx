import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { formatAppError, isOfflineError, isOfflineMessage } from "@/lib/errors";
import { createWakeRetry } from "@/lib/wake-retry";
import { fetchMyHomes, fetchMyHousehold } from "@/features/homes/api/homes";
import { readCachedHousehold, writeCachedHousehold } from "@/features/offline/saved";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { onOutboxEvent } from "@/features/offline/outbox";
import type { HomeSummary, Household } from "@/features/homes/types/household";

type HouseholdContextValue = {
  household: Household | null;
  homes: HomeSummary[];
  hasHousehold: boolean;
  /** Loading failed and no home is saved on this phone: unknown, not "none". */
  loadFailed: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<Household | null>;
  adoptHome: (next: Household) => void;
};

/** Coming back to the app reloads the home, but not more often than this. */
const FOREGROUND_REFRESH_MS = 60_000;

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [homes, setHomes] = useState<HomeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const currentUserIdRef = useRef(user?.id ?? null);
  const requestSequenceRef = useRef(0);
  const userId = user?.id ?? null;
  const lastLoadRef = useRef(0);
  const refreshRef = useRef<() => unknown>(() => undefined);
  const [wakeRetry] = useState(createWakeRetry);
  const [trackedUserId, setTrackedUserId] = useState<string | null | undefined>(undefined);

  if (!isAuthLoading && userId !== trackedUserId) {
    setTrackedUserId(userId);
    setLoadFailed(false);
    if (!userId) {
      setHousehold(null);
      setHomes([]);
      setError(null);
      setIsLoading(false);
    } else {
      const cached = readCachedHousehold();
      setHousehold(cached?.household ?? null);
      setHomes(cached?.homes ?? []);
      setError(null);
      setIsLoading(!cached);
    }
  }

  const adoptHome = useCallback((next: Household) => {
    requestSequenceRef.current += 1;
    setHousehold(next);
    setError(null);
    setIsLoading(false);
    writeCachedHousehold(next);
  }, []);

  const refresh = useCallback(async () => {
    const initiatingUserId = userId;
    const requestSequence = ++requestSequenceRef.current;

    if (!userId) {
      setHousehold(null);
      setHomes([]);
      setError(null);
      setIsLoading(false);
      return null;
    }

    try {
      const [next, listed] = await Promise.all([fetchMyHousehold(), fetchMyHomes()]);
      if (
        currentUserIdRef.current !== initiatingUserId ||
        requestSequenceRef.current !== requestSequence
      ) {
        return null;
      }
      lastLoadRef.current = Date.now();
      // The saved copy answered instead of the server: ask again shortly.
      if (listed.offline) wakeRetry.stale();
      else wakeRetry.fresh();
      setHousehold(next);
      setLoadFailed(false);
      if (!next) {
        setHomes([]);
        writeCachedHousehold(null);
      } else if (!listed.error) {
        setHomes(listed.homes);
        writeCachedHousehold(next, listed.homes);
      } else if (isOfflineMessage(listed.error)) {
        const cachedHomes = readCachedHousehold()?.homes ?? [];
        if (cachedHomes.length > 0) setHomes(cachedHomes);
        writeCachedHousehold(next, cachedHomes.length > 0 ? cachedHomes : undefined);
      } else {
        writeCachedHousehold(next);
      }
      setError(listed.error && isOfflineMessage(listed.error) ? null : listed.error);
      setIsLoading(false);
      return next;
    } catch (error) {
      if (
        currentUserIdRef.current !== initiatingUserId ||
        requestSequenceRef.current !== requestSequence
      ) {
        return null;
      }
      const offline = isOfflineError(error);
      if (offline) wakeRetry.stale();
      const cached = offline ? readCachedHousehold() : null;
      if (cached?.household) {
        setHousehold(cached.household);
        setHomes(cached.homes);
        setError(null);
        setIsLoading(false);
        return cached.household;
      }
      setError(formatAppError(error));
      setLoadFailed(true);
      setIsLoading(false);
      return null;
    }
  }, [userId, wakeRetry]);

  useEffect(() => {
    refreshRef.current = refresh;
    wakeRetry.setRun(refresh);
  }, [refresh, wakeRetry]);

  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
    requestSequenceRef.current += 1;
    return () => wakeRetry.cancel();
  }, [user?.id, wakeRetry]);

  // Back in the app after a while: the home may have changed on another phone
  // (renamed, a member added or removed, the host changed its options).
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (Date.now() - lastLoadRef.current < FOREGROUND_REFRESH_MS) return;
      void refreshRef.current();
    });
    return () => subscription.remove();
  }, [userId]);

  // Changes that waited offline were sent (or the connection came back): the
  // home's name and options may differ from what this phone assumed.
  useEffect(() => {
    if (!userId) return;
    return onOutboxEvent((event) => {
      if (event.type === "settled") void refreshRef.current();
    });
  }, [userId]);

  useEffect(() => {
    if (isAuthLoading) return;
    const refreshTimer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(refreshTimer);
  }, [isAuthLoading, refresh]);

  const value = useMemo(
    () => ({
      household,
      homes,
      hasHousehold: household !== null,
      loadFailed: loadFailed && household === null,
      isLoading: isAuthLoading || isLoading,
      error,
      refresh,
      adoptHome,
    }),
    [adoptHome, error, homes, household, isAuthLoading, isLoading, loadFailed, refresh],
  );

  return (
    <HouseholdContext.Provider value={value}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error("useHousehold must be used inside HouseholdProvider");
  }
  return context;
}
