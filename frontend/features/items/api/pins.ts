import { addItemLocally } from "@/features/items/api/items";
import type { PurchaseCategory } from "@/features/items/types/purchase";
import { newId } from "@/features/offline/ids";
import { defineChange, perform } from "@/features/offline/outbox";
import { qk, queryClient, writeCache } from "@/features/offline/query-client";
import { readThrough } from "@/features/offline/read";
import { isAlreadyGone } from "@/features/offline/rules";
import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";

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
  const result = await readThrough<Pin[]>(qk.pins(homeId), async () =>
    (await api.get<PinResponse[]>(`/homes/${homeId}/pins`)).map(toPin),
  );
  if (result.data) return { pins: result.data, error: null };
  return { pins: [] as Pin[], error: formatAppError(result.error) };
}

type PinInput = {
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
};

const createChange = defineChange<{ homeId: string; body: Record<string, unknown> }>(
  "pin.create",
  (payload) => api.post(`/homes/${payload.homeId}/pins`, payload.body),
);

const updateChange = defineChange<{ pinId: string; body: Record<string, unknown> }>(
  "pin.update",
  (payload) => api.patch(`/pins/${payload.pinId}`, payload.body),
);

const deleteChange = defineChange<{ pinId: string }>(
  "pin.delete",
  (payload) => api.delete(`/pins/${payload.pinId}`),
  // Already removed on another phone is what was asked for.
  { tolerate: isAlreadyGone },
);

function changePins(homeId: string, change: (pins: Pin[]) => Pin[]) {
  writeCache<Pin[]>(qk.pins(homeId), (current) => (current ? change(current) : current));
}

/** The home(s) whose saved pins include this one. */
function homesWithPin(pinId: string) {
  return queryClient
    .getQueriesData<Pin[]>({ queryKey: ["pins"] })
    .flatMap(([key, pins]) =>
      Array.isArray(pins) && typeof key[1] === "string" && pins.some((pin) => pin.id === pinId)
        ? [{ homeId: key[1], pins }]
        : [],
    );
}

/** A close guess at the server's date, shown until the saved pin is loaded. */
function guessNextDue(intervalDays: number) {
  const days = intervalDays > 0 ? intervalDays : 365 * 100;
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString();
}

export async function createPin(homeId: string, input: PinInput) {
  const id = newId();
  // "Add now" also puts the item on the list; it gets an id here too, so the
  // list shows it at once and a repeated send never adds it twice.
  const itemId = input.addNow ? newId() : undefined;
  const monthly = input.intervalDays === 30 && input.monthDay;
  const pin: Pin = {
    id,
    name: input.name.trim(),
    quantity: input.quantity,
    unit: input.unit?.trim() || undefined,
    category: input.category,
    urgent: input.urgent,
    intervalDays: input.intervalDays,
    monthDay: monthly ? (input.monthDay ?? null) : null,
    nextDueAt: guessNextDue(input.intervalDays),
    listId: input.listId ?? null,
  };
  changePins(homeId, (pins) => [...pins, pin]);
  const removeItem = itemId
    ? addItemLocally(homeId, {
        id: itemId,
        name: pin.name,
        quantity: pin.quantity,
        unit: pin.unit,
        category: pin.category,
        urgent: pin.urgent,
        listId: input.listId,
      })
    : null;

  const result = await perform(
    createChange,
    {
      homeId,
      body: {
        id,
        ...(itemId ? { itemId } : {}),
        name: input.name,
        quantity: input.quantity,
        category: input.category,
        urgent: input.urgent,
        intervalDays: input.intervalDays,
        ...(monthly ? { monthDay: input.monthDay, utcOffsetMin: utcOffsetMin() } : {}),
        addNow: input.addNow,
        unit: input.unit?.trim() || undefined,
        listId: input.listId,
      },
    },
    { action: "add", title: pin.name },
  );
  if (result.error) {
    changePins(homeId, (pins) => pins.filter((entry) => entry.id !== id));
    removeItem?.();
  }
  return { error: result.error };
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
  const monthly = input.intervalDays === 30 && input.monthDay;
  const before = homesWithPin(pinId);
  for (const home of before) {
    changePins(home.homeId, (pins) =>
      pins.map((pin) =>
        pin.id === pinId
          ? {
              ...pin,
              name: input.name.trim(),
              category: input.category,
              urgent: input.urgent,
              intervalDays: input.intervalDays,
              monthDay: input.intervalDays !== 30 ? null : (input.monthDay ?? pin.monthDay),
              nextDueAt:
                pin.intervalDays === input.intervalDays
                  ? pin.nextDueAt
                  : guessNextDue(input.intervalDays),
              ...(typeof input.quantity === "number" ? { quantity: input.quantity } : {}),
              ...(typeof input.unit === "string" ? { unit: input.unit.trim() || undefined } : {}),
              ...(input.listId ? { listId: input.listId } : {}),
            }
          : pin,
      ),
    );
  }
  const result = await perform(
    updateChange,
    {
      pinId,
      body: {
        name: input.name,
        category: input.category,
        urgent: input.urgent,
        intervalDays: input.intervalDays,
        ...(monthly ? { monthDay: input.monthDay, utcOffsetMin: utcOffsetMin() } : {}),
        ...(typeof input.quantity === "number" ? { quantity: input.quantity } : {}),
        ...(typeof input.unit === "string" ? { unit: input.unit.trim() } : {}),
        ...(input.listId ? { listId: input.listId } : {}),
      },
    },
    { action: "edit", title: input.name.trim() },
  );
  if (result.error) {
    for (const home of before) writeCache<Pin[]>(qk.pins(home.homeId), home.pins);
  }
  return { error: result.error };
}

export async function deletePin(pinId: string) {
  const before = homesWithPin(pinId);
  const title = before[0]?.pins.find((pin) => pin.id === pinId)?.name;
  for (const home of before) {
    changePins(home.homeId, (pins) => pins.filter((pin) => pin.id !== pinId));
  }
  const result = await perform(deleteChange, { pinId }, {
    action: "delete",
    ...(title ? { title } : { count: 1 }),
  });
  if (result.error) {
    for (const home of before) writeCache<Pin[]>(qk.pins(home.homeId), home.pins);
  }
  return { error: result.error };
}
