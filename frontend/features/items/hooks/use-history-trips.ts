import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  fetchTrip,
  fetchTripsPage,
  historyKeys,
  type TripsPage,
} from "@/features/items/api/history";
import { mergePages } from "@/features/items/utils/history";
import { queryClient } from "@/features/offline/query-client";

/** A month's trips, 20 at a time, newest first (the Invoices page). */
export function useHistoryTrips(
  homeId: string | null,
  month: string,
  listId: string | null,
  enabled = true,
) {
  const result = useInfiniteQuery(
    {
      queryKey: historyKeys.trips(homeId ?? "none", month, listId),
      queryFn: ({ pageParam }) => fetchTripsPage(homeId as string, month, listId, pageParam),
      initialPageParam: null as string | null,
      getNextPageParam: (last: TripsPage) => last.next ?? undefined,
      enabled: Boolean(homeId) && enabled,
      networkMode: "online",
    },
    queryClient,
  );
  return {
    trips: mergePages(
      result.data?.pages.map((page) => page.trips),
      (trip) => trip.id,
    ),
    loaded: result.data !== undefined,
    hasMore: result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    waitingOffline: result.data === undefined && result.fetchStatus === "paused",
    failed: result.data === undefined && result.isError,
    loadMore: () => {
      if (result.hasNextPage && !result.isFetchingNextPage) void result.fetchNextPage();
    },
  };
}

/** One trip with all its items (an opened receipt card). */
export function useHistoryTrip(homeId: string | null, tripId: string | null) {
  const result = useQuery(
    {
      queryKey: historyKeys.trip(homeId ?? "none", tripId ?? "none"),
      queryFn: () => fetchTrip(homeId as string, tripId as string),
      enabled: Boolean(homeId && tripId),
      networkMode: "online",
    },
    queryClient,
  );
  return {
    detail: result.data ?? null,
    waitingOffline: result.data === undefined && result.fetchStatus === "paused",
    failed: result.data === undefined && result.isError,
  };
}
