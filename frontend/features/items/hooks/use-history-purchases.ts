import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchPurchasesPage, historyKeys, type PurchasesPage } from "@/features/items/api/history";
import { mergePages } from "@/features/items/utils/history";
import { queryClient } from "@/features/offline/query-client";

/** Search answers are not worth keeping on the phone for long. */
const SEARCH_KEEP_MS = 60_000;

/**
 * A month's purchases (or a search across every kept month), 30 at a time,
 * newest first. Reaching the end of the list asks for the next page with the
 * server's cursor. Without a connection the request waits (networkMode
 * "online") and pages already loaded stay on screen.
 */
export function useHistoryPurchases(
  homeId: string | null,
  filter: { month: string; listId: string | null; category: string | null; q: string },
) {
  const search = filter.q.trim();
  const result = useInfiniteQuery(
    {
      queryKey: search
        ? historyKeys.search(homeId ?? "none", search)
        : historyKeys.purchases(homeId ?? "none", filter.month, filter.listId, filter.category),
      queryFn: ({ pageParam }) =>
        fetchPurchasesPage(
          homeId as string,
          search ? { q: search } : { month: filter.month, listId: filter.listId, category: filter.category },
          pageParam,
        ),
      initialPageParam: null as string | null,
      getNextPageParam: (last: PurchasesPage) => last.next ?? undefined,
      enabled: Boolean(homeId),
      networkMode: "online",
      ...(search ? { gcTime: SEARCH_KEEP_MS } : null),
    },
    queryClient,
  );
  const purchases = mergePages(
    result.data?.pages.map((page) => page.items),
    (item) => item.id,
  );
  return {
    purchases,
    loaded: result.data !== undefined,
    hasMore: result.hasNextPage,
    loadingMore: result.isFetchingNextPage,
    /** Never loaded and waiting for a connection. */
    waitingOffline: result.data === undefined && result.fetchStatus === "paused",
    failed: result.data === undefined && result.isError,
    loadMore: () => {
      if (result.hasNextPage && !result.isFetchingNextPage) void result.fetchNextPage();
    },
    refetch: result.refetch,
  };
}
