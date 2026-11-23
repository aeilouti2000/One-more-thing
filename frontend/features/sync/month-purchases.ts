import { useQueries } from "@tanstack/react-query";
import { toPurchase, type ItemResponse } from "@/features/items/api/items";
import type { Purchase } from "@/features/items/types/purchase";
import { qk, queryClient, readCache } from "@/features/offline/query-client";
import { monthOfWindowStart, withOlderMonths } from "@/features/sync/apply";
import type { SyncState } from "@/features/sync/types";

export { withOlderMonths };
import { api } from "@/lib/api";

/** "YYYY-MM" of the first month the phone holds itself (last month). */
export function windowMonth(homeId: string) {
  const state = readCache<SyncState>(qk.syncState(homeId));
  return state ? monthOfWindowStart(state.windowStart) : null;
}

/** True when the phone holds that month's purchases itself (this month and last). */
export function monthOnPhone(homeId: string, month: string) {
  const first = windowMonth(homeId);
  return first !== null && month >= first;
}

/** Every purchase of one month from the server, page by page (History endpoint). */
export async function loadMonthPurchases(homeId: string, month: string): Promise<Purchase[]> {
  const items: Purchase[] = [];
  let next: string | null = null;
  for (let page = 0; page < 50; page += 1) {
    const query = `month=${month}&limit=100${next ? `&before=${encodeURIComponent(next)}` : ""}`;
    const answer: { items: ItemResponse[]; next: string | null } = await api.get(
      `/homes/${homeId}/history/purchases?${query}`,
    );
    items.push(...answer.items.map(toPurchase));
    next = answer.next;
    if (!next) break;
  }
  return items;
}

/**
 * Purchases of months the phone does not hold, loaded once and kept with the
 * saved copy (so a recap seen once also opens offline).
 */
export function useOlderMonths(homeId: string | null | undefined, months: string[]): Purchase[] {
  const wanted = homeId ? months.filter((month) => !monthOnPhone(homeId, month)) : [];
  const results = useQueries(
    {
      queries: wanted.map((month) => ({
        queryKey: ["monthPurchases", homeId, month] as const,
        queryFn: () => loadMonthPurchases(homeId as string, month),
        staleTime: 10 * 60_000,
        enabled: Boolean(homeId),
      })),
    },
    queryClient,
  );
  return results.flatMap((result) => result.data ?? []);
}
