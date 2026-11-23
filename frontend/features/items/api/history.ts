import { toPurchase, type ItemResponse } from "@/features/items/api/items";
import type { Purchase } from "@/features/items/types/purchase";
import { api } from "@/lib/api";

/**
 * History, read one page at a time from the server (backend history module).
 * The answers are kept in the query client, which is saved on the phone, so a
 * month already seen still opens offline.
 */

export type MonthState = "live" | "archived" | "none";

/** One entry of GET /history/months: a month with purchases or saved totals. */
export type HistoryMonth = {
  month: string;
  state: "live" | "archived";
  spend: number;
  itemCount: number;
};

/** GET /history/months/:month. Category "" is the part of trip totals not split by category. */
export type MonthStats = {
  month: string;
  state: MonthState;
  itemCount: number;
  pricedCount: number;
  tripCount: number;
  spend: number;
  categories: { category: string; itemCount: number; spend: number }[];
  budget: number | null;
};

export type HistoryTrip = {
  id: string;
  name: string | null;
  listId: string | null;
  listName: string | null;
  startedAt: string;
  lastBoughtAt: string;
  /** The trip's total, or the sum of its item prices when it has none. */
  total: number;
  hasTotal: boolean;
  itemCount: number;
  pricedCount: number;
  itemsTotal: number;
  /** The first three items. */
  preview: { name: string; category: string; imageId: string | null }[];
};

export type PurchasesPage = { items: Purchase[]; next: string | null };
export type TripsPage = { trips: HistoryTrip[]; next: string | null };
export type TripDetail = {
  trip: {
    id: string;
    name: string | null;
    listId: string | null;
    listName: string | null;
    total: number | null;
    startedAt: string;
    lastBoughtAt: string;
  };
  items: Purchase[];
};

export type PurchasesFilter = {
  month?: string;
  listId?: string | null;
  category?: string | null;
  /** Search text: every month the plan keeps; `month` is ignored. */
  q?: string;
};

/** Query keys; everything of one home is under ["history", homeId]. */
export const historyKeys = {
  all: (homeId: string) => ["history", homeId] as const,
  months: (homeId: string) => ["history", homeId, "months"] as const,
  month: (homeId: string, month: string) => ["history", homeId, "month", month] as const,
  purchases: (homeId: string, month: string, listId: string | null, category: string | null) =>
    ["history", homeId, "purchases", month, listId ?? "all", category ?? "all"] as const,
  search: (homeId: string, q: string) => ["history", homeId, "search", q] as const,
  trips: (homeId: string, month: string, listId: string | null) =>
    ["history", homeId, "trips", month, listId ?? "all"] as const,
  trip: (homeId: string, tripId: string) => ["history", homeId, "trip", tripId] as const,
};

function query(params: Record<string, string | number | null | undefined>) {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

const money = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export async function fetchMonths(homeId: string) {
  const answer = await api.get<{ months: HistoryMonth[] }>(`/homes/${homeId}/history/months`);
  return answer.months.map((month) => ({ ...month, spend: money(month.spend) }));
}

export async function fetchMonthStats(homeId: string, month: string): Promise<MonthStats> {
  const answer = await api.get<MonthStats>(`/homes/${homeId}/history/months/${month}`);
  return {
    ...answer,
    spend: money(answer.spend),
    budget: answer.budget === null || answer.budget === undefined ? null : money(answer.budget),
    categories: answer.categories.map((row) => ({ ...row, spend: money(row.spend) })),
  };
}

export async function fetchPurchasesPage(
  homeId: string,
  filter: PurchasesFilter,
  before: string | null,
  limit?: number,
): Promise<PurchasesPage> {
  const answer = await api.get<{ items: ItemResponse[]; next: string | null }>(
    `/homes/${homeId}/history/purchases${query({
      ...(filter.q ? { q: filter.q } : { month: filter.month }),
      ...(filter.q ? {} : { listId: filter.listId, category: filter.category }),
      before,
      limit,
    })}`,
  );
  return { items: answer.items.map(toPurchase), next: answer.next };
}

export async function fetchTripsPage(
  homeId: string,
  month: string,
  listId: string | null,
  before: string | null,
  limit?: number,
): Promise<TripsPage> {
  const answer = await api.get<TripsPage>(
    `/homes/${homeId}/history/trips${query({ month, listId, before, limit })}`,
  );
  return {
    next: answer.next,
    trips: answer.trips.map((trip) => ({
      ...trip,
      total: money(trip.total),
      itemsTotal: money(trip.itemsTotal),
      preview: trip.preview ?? [],
    })),
  };
}

export async function fetchTrip(homeId: string, tripId: string): Promise<TripDetail> {
  const answer = await api.get<{ trip: TripDetail["trip"]; items: ItemResponse[] }>(
    `/homes/${homeId}/history/trips/${tripId}`,
  );
  return {
    trip: { ...answer.trip, total: answer.trip.total === null ? null : money(answer.trip.total) },
    items: answer.items.map(toPurchase),
  };
}
