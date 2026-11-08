import { api } from "@/lib/api";
import { formatAppError, isOfflineError } from "@/lib/errors";
import { readCachedPins, writeCachedPins } from "@/features/offline/profile-cache";
import type { PurchaseCategory } from "@/features/items/types/purchase";

/** 0 = once (manual only; never auto-returns to the list). */
export const PIN_INTERVALS = [0, 1, 7, 14, 30] as const;
export type PinInterval = (typeof PIN_INTERVALS)[number];

export type Pin = {
  id: string;
  name: string;
  quantity: number;
  unit?: string;
  category: PurchaseCategory;
  urgent: boolean;
  intervalDays: PinInterval;
  /** Monthly pins: day of the month it returns on (null: every 30 days). */
  monthDay: number | null;
  nextDueAt: string;
  /** The list it repeats onto; null means the home's first list. */
  listId: string | null;
};

type PinResponse = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: PurchaseCategory;
  urgent: boolean;
  intervalDays: PinInterval;
  monthDay?: number | null;
  nextDueAt: string;
  listId?: string | null;
};

/** Device offset east of UTC, so the server finds "day N" in local time. */
function utcOffsetMin() {
  return -new Date().getTimezoneOffset();
}

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
    monthDay: row.monthDay ?? null,
    nextDueAt: row.nextDueAt,
    listId: row.listId ?? null,
  };
}

export async function fetchPins(homeId: string) {
  try {
    const pins = (await api.get<PinResponse[]>(`/homes/${homeId}/pins`)).map(toPin);
    writeCachedPins(homeId, pins);
    return { pins, error: null };
  } catch (error) {
    if (isOfflineError(error)) {
      const cached = readCachedPins<Pin>(homeId);
      if (cached) return { pins: cached, error: null };
    }
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
    /** Monthly pins: day of the month (1–31). */
    monthDay?: number;
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
      ...(input.intervalDays === 30 && input.monthDay
        ? { monthDay: input.monthDay, utcOffsetMin: utcOffsetMin() }
        : {}),
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
    /** Monthly pins: day of the month (1–31). */
    monthDay?: number;
    quantity?: number;
    /** Omit to keep; "" clears. */
    unit?: string;
    listId?: string;
  },
) {
  try {
    await api.patch(`/pins/${pinId}`, {
      name: input.name,
      category: input.category,
      urgent: input.urgent,
      intervalDays: input.intervalDays,
      ...(input.intervalDays === 30 && input.monthDay
        ? { monthDay: input.monthDay, utcOffsetMin: utcOffsetMin() }
        : {}),
      ...(typeof input.quantity === "number" ? { quantity: input.quantity } : {}),
      ...(typeof input.unit === "string" ? { unit: input.unit.trim() } : {}),
      ...(input.listId ? { listId: input.listId } : {}),
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
