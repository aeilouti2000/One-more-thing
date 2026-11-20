import type { Household } from "@/features/homes/types/household";
import type { Pin } from "@/features/items/api/pins";
import type { Purchase } from "@/features/items/types/purchase";
import { normalizeName } from "@/features/items/utils/insights";
import { latestInvoiceThisMonth } from "@/features/items/utils/trips";

/** A row shown before the server saved it has a temporary id (see api/items). */
export function isUnsavedId(id: string) {
  return id.startsWith("temp-");
}

/** A tick is held this long before it is sent, so a second tap can take it back. */
export const UNDO_WINDOW_MS = 2500;

export type PinAddPlan =
  /** Already waiting on a list: the tile only needs to show that. */
  | { kind: "exists" }
  /** Parked on the Later shelf: bring that one back instead of adding a twin. */
  | { kind: "restore"; itemId: string }
  | { kind: "create"; listId: string | undefined };

/**
 * What tapping a pinned item on the widget should do. It never raises a
 * quantity: sending the same tap twice must not add the item twice.
 */
export function planPinAdd(
  pin: Pick<Pin, "name" | "listId">,
  items: Purchase[],
  lists: { id: string }[],
  preferredListId: string | null,
): PinAddPlan {
  const name = normalizeName(pin.name);
  const wanted = items.filter((item) => item.status === "needed" && normalizeName(item.name) === name);
  if (wanted.some((item) => !item.laterAt)) return { kind: "exists" };
  // Into the pin's own list (if it still exists), like when it repeats.
  const listId =
    (pin.listId && lists.some((list) => list.id === pin.listId) ? pin.listId : null) ??
    preferredListId ??
    undefined;
  const parked = wanted.find((item) => !listId || item.listId === listId);
  if (parked) return { kind: "restore", itemId: parked.id };
  return { kind: "create", listId };
}

/**
 * The invoice an item ticked on the widget joins. Same rule as ticking it in
 * the app outside a trip: in trip-total mode, this month's latest invoice of
 * the same list.
 */
export function invoiceForBuy(
  household: Pick<Household, "costsEnabled" | "tripCostMode">,
  items: Purchase[],
  item: Purchase,
  now: Date,
): string | null {
  if (household.costsEnabled !== true || household.tripCostMode !== "total") return null;
  return latestInvoiceThisMonth(items, now, item.listId ?? null);
}
