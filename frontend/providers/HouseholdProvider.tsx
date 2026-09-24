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
import { formatAppError } from "@/lib/errors";
import { fetchMyHousehold } from "@/lib/homes";
import { useAuth } from "@/providers/AuthProvider";
import type { Household } from "@/types/household";

type HouseholdContextValue = {
  household: Household | null;
  hasHousehold: boolean;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<Household | null>;
  adoptHome: (next: Household) => void;
};

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [household, setHousehold] = useState<Household | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const currentUserIdRef = useRef(user?.id ?? null);
  const requestSequenceRef = useRef(0);

  const adoptHome = useCallback((next: Household) => {
    requestSequenceRef.current += 1;
    setHousehold(next);
    setError(null);
    setIsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    const initiatingUserId = user?.id ?? null;
    const requestSequence = ++requestSequenceRef.current;

    if (!user) {
      setHousehold(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    try {
      const next = await fetchMyHousehold();
      if (
        currentUserIdRef.current !== initiatingUserId ||
        requestSequenceRef.current !== requestSequence
      ) {
        return null;
      }
      setHousehold(next);
      setError(null);
      setIsLoading(false);
      return next;
    } catch (error) {
      if (
        currentUserIdRef.current !== initiatingUserId ||
        requestSequenceRef.current !== requestSequence
      ) {
        return null;
      }
      setError(formatAppError(error));
      setIsLoading(false);
      return null;
    }
  }, [user]);

  useEffect(() => {
    currentUserIdRef.current = user?.id ?? null;
    requestSequenceRef.current += 1;
  }, [user?.id]);

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
      hasHousehold: household !== null,
      isLoading: isAuthLoading || isLoading,
      error,
      refresh,
      adoptHome,
    }),
    [adoptHome, error, household, isAuthLoading, isLoading, refresh],
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
