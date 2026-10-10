import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";
import type { PurchaseCategory } from "@/features/items/types/purchase";

export const PIN_INTERVALS = [1, 7, 14, 30] as const;
export type PinInterval = (typeof PIN_INTERVALS)[number];

export type Pin = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  category: PurchaseCategory;
  urgent: boolean;
  intervalDays: PinInterval;
  nextDueAt: string;
};

type PinResponse = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: PurchaseCategory;
  urgent: boolean;
  intervalDays: PinInterval;
  nextDueAt: string;
};

function toPin(row: PinResponse): Pin {
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

export async function fetchPins(homeId: string) {
  try {
    const rows = await api.get<PinResponse[]>(`/homes/${homeId}/pins`);
    return { pins: rows.map(toPin), error: null };
  } catch (error) {
    return { pins: [] as Pin[], error: formatAppError(error) };
  }
}

export async function createPin(
  homeId: string,
  input: {
    name: string;
    quantity: number;
    category: PurchaseCategory;
    urgent: boolean;
    intervalDays: PinInterval;
    addNow: boolean;
    unit?: string;
    listId?: string;
  },
) {
  try {
    await api.post(`/homes/${homeId}/pins`, {
      name: input.name,
      quantity: input.quantity,
      category: input.category,
      urgent: input.urgent,
      intervalDays: input.intervalDays,
      addNow: input.addNow,
      unit: input.unit?.trim() || undefined,
      listId: input.listId,
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function updatePin(
  pinId: string,
  input: {
    name: string;
    category: PurchaseCategory;
    urgent: boolean;
    intervalDays: PinInterval;
  },
) {
  try {
    await api.patch(`/pins/${pinId}`, {
      name: input.name,
      category: input.category,
      urgent: input.urgent,
      intervalDays: input.intervalDays,
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function deletePin(pinId: string) {
  try {
    await api.delete(`/pins/${pinId}`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
