import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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

  const adoptHome = useCallback((next: Household) => {
    setHousehold(next);
    setError(null);
    setIsLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setHousehold(null);
      setError(null);
      setIsLoading(false);
      return null;
    }

    const next = await fetchMyHousehold();
    setHousehold(next);
    setError(null);
    setIsLoading(false);
    return next;
  }, [user]);

  useEffect(() => {
    if (isAuthLoading) return;
    void refresh();
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
