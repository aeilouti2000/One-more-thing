import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";
import type { PurchaseCategory } from "@/types/purchase";

export const STAPLE_INTERVALS = [1, 7, 14, 30] as const;
export type StapleInterval = (typeof STAPLE_INTERVALS)[number];

export type Staple = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  category: PurchaseCategory;
  urgent: boolean;
  intervalDays: StapleInterval;
  nextDueAt: string;
};

type StapleResponse = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: PurchaseCategory;
  urgent: boolean;
  intervalDays: StapleInterval;
  nextDueAt: string;
};

function toStaple(row: StapleResponse): Staple {
  const quantity = Number(row.quantity);
  return {
    id: row.id,
    name: row.name,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: row.unit ?? undefined,
    category: row.category,
    urgent: Boolean(row.urgent),
    intervalDays: row.intervalDays,
    nextDueAt: row.nextDueAt,
  };
}

export async function fetchStaples(homeId: string) {
  try {
    const rows = await api.get<StapleResponse[]>(`/homes/${homeId}/staples`);
    return { staples: rows.map(toStaple), error: null };
  } catch (error) {
    return { staples: [] as Staple[], error: formatAppError(error) };
  }
}

export async function createStaple(
  homeId: string,
  input: {
    name: string;
    quantity: number;
    category: PurchaseCategory;
    urgent: boolean;
    intervalDays: StapleInterval;
    addNow: boolean;
  },
) {
  try {
    await api.post(`/homes/${homeId}/staples`, input);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function deleteStaple(stapleId: string) {
  try {
    await api.delete(`/staples/${stapleId}`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
