import { useQuery } from "@tanstack/react-query";
import { fetchMonths, fetchMonthStats, historyKeys } from "@/features/items/api/history";
import { queryClient } from "@/features/offline/query-client";

/** Every month with purchases or saved totals, newest first (the month controls). */
export function useHistoryMonths(homeId: string | null) {
  const result = useQuery(
    {
      queryKey: historyKeys.months(homeId ?? "none"),
      queryFn: () => fetchMonths(homeId as string),
      enabled: Boolean(homeId),
      networkMode: "online",
    },
    queryClient,
  );
  return { months: result.data, loaded: result.data !== undefined };
}

/** A month's totals from the server: spend, counts, categories, budget, state. */
export function useMonthStats(homeId: string | null, month: string) {
  const result = useQuery(
    {
      queryKey: historyKeys.month(homeId ?? "none", month),
      queryFn: () => fetchMonthStats(homeId as string, month),
      enabled: Boolean(homeId),
      networkMode: "online",
    },
    queryClient,
  );
  return {
    stats: result.data ?? null,
    waitingOffline: result.data === undefined && result.fetchStatus === "paused",
  };
}
