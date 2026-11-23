import type { Purchase, PurchaseCategory } from "@/features/items/types/purchase";

/**
 * What each change does to the list on this phone, before (or without) the
 * server's answer. The same rules the server applies, so the screen shows the
 * result at once and it still matches after the next reload.
 */

/** Mirror backend placeNeeded: urgent at top, else after the urgent block. */
export function placeNeeded(purchases: Purchase[], item: Purchase): Purchase[] {
  const needed = purchases.filter((row) => row.status === "needed");
  const bought = purchases.filter((row) => row.status === "bought");
  if (item.urgent) return [item, ...needed, ...bought];
  // Below the urgent rows of its own list (the server orders each list by itself).
  const sameList = (row: Purchase) => !item.listId || row.listId === item.listId;
  let index = needed.findIndex((row) => sameList(row) && !row.urgent);
  if (index === -1) {
    const lastOfList = needed.findLastIndex(sameList);
    index = lastOfList === -1 ? needed.length : lastOfList + 1;
  }
  return [...needed.slice(0, index), item, ...needed.slice(index), ...bought];
}

/** Adds a new row; the same id twice (a repeated send) stays one row. */
export function withAdded(purchases: Purchase[], item: Purchase): Purchase[] {
  if (purchases.some((row) => row.id === item.id)) return purchases;
  return placeNeeded(purchases, item);
}

export type DetailChanges = {
  name?: string;
  quantity?: number;
  category?: PurchaseCategory;
  urgent?: boolean;
  notes?: string;
  /** "" clears it. */
  unit?: string;
};

export function withDetails(purchases: Purchase[], id: string, changes: DetailChanges): Purchase[] {
  return purchases.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item };
    if (changes.name !== undefined) next.name = changes.name;
    if (changes.quantity !== undefined) next.quantity = changes.quantity;
    if (changes.category !== undefined) next.category = changes.category;
    // A bought item keeps no urgent mark.
    if (changes.urgent !== undefined && item.status === "needed") next.urgent = changes.urgent;
    if (changes.notes !== undefined) next.notes = changes.notes.trim() || undefined;
    if (changes.unit !== undefined) next.unit = changes.unit.trim() || undefined;
    return next;
  });
}

/** Only what differs from the item as it is now: the fields worth sending. */
export function changedDetails(item: Purchase | undefined, values: DetailChanges): DetailChanges {
  if (!item) return values;
  const changes: DetailChanges = {};
  if (values.name !== undefined && values.name.trim() !== item.name) changes.name = values.name.trim();
  if (values.quantity !== undefined && values.quantity !== item.quantity) {
    changes.quantity = values.quantity;
  }
  if (values.category !== undefined && values.category !== item.category) {
    changes.category = values.category;
  }
  if (values.urgent !== undefined && values.urgent !== item.urgent) changes.urgent = values.urgent;
  if (typeof values.notes === "string" && values.notes.trim() !== (item.notes ?? "")) {
    changes.notes = values.notes.trim();
  }
  if (typeof values.unit === "string" && values.unit.trim() !== (item.unit ?? "")) {
    changes.unit = values.unit.trim();
  }
  return changes;
}

export type Buyer = { id: string; name?: string | null };

export function withBought(
  purchases: Purchase[],
  costs: Map<string, number | null>,
  boughtAt: string,
  buyer?: Buyer,
  receipt?: { id: string; total?: number | null; name?: string | null } | null,
): Purchase[] {
  return purchases.map((item) =>
    costs.has(item.id) && item.status === "needed"
      ? {
          ...item,
          status: "bought" as const,
          urgent: false,
          boughtAt,
          cost: costs.get(item.id) ?? null,
          boughtById: buyer?.id ?? item.boughtById,
          boughtByName: buyer?.name ?? item.boughtByName,
          notFoundAt: undefined,
          notFoundById: undefined,
          notFoundByName: undefined,
          ...(receipt
            ? { receiptId: receipt.id, receiptTotal: receipt.total ?? null, receiptName: receipt.name ?? null }
            : {}),
        }
      : item,
  );
}

export function withUndone(purchases: Purchase[], id: string): Purchase[] {
  const target = purchases.find((item) => item.id === id && item.status === "bought");
  if (!target) return purchases;
  const back: Purchase = {
    ...target,
    status: "needed",
    boughtAt: undefined,
    boughtById: undefined,
    boughtByName: undefined,
    cost: null,
    receiptId: null,
    receiptTotal: null,
    receiptName: null,
  };
  return placeNeeded(
    purchases.filter((item) => item.id !== id),
    back,
  );
}

export function withNotFound(
  purchases: Purchase[],
  id: string,
  mark: { at: string; by: Buyer } | null,
): Purchase[] {
  return purchases.map((item) =>
    item.id === id && item.status === "needed"
      ? mark
        ? {
            ...item,
            notFoundAt: mark.at,
            notFoundById: mark.by.id,
            notFoundByName: mark.by.name ?? undefined,
          }
        : { ...item, notFoundAt: undefined, notFoundById: undefined, notFoundByName: undefined }
      : item,
  );
}

export function withCosts(purchases: Purchase[], costs: Map<string, number | null>): Purchase[] {
  return purchases.map((item) => (costs.has(item.id) ? { ...item, cost: costs.get(item.id) } : item));
}

export function without(purchases: Purchase[], ids: string[]): Purchase[] {
  const removing = new Set(ids);
  return purchases.filter((item) => !removing.has(item.id));
}

/** Changes fields on these items, only while they are still needed. */
export function withNeededPatch(
  purchases: Purchase[],
  ids: string[],
  patch: Partial<Purchase>,
): Purchase[] {
  const selected = new Set(ids);
  return purchases.map((item) =>
    selected.has(item.id) && item.status === "needed" ? { ...item, ...patch } : item,
  );
}

/** Puts the needed rows named in `ids` in that order, in the places they held. */
export function withOrder(purchases: Purchase[], ids: string[]): Purchase[] {
  const neededRows = purchases.filter((item) => item.status === "needed");
  const boughtRows = purchases.filter((item) => item.status === "bought");
  const byId = new Map(neededRows.map((item) => [item.id, item]));
  const moving = new Set(ids);
  const queue = ids.filter((id) => byId.has(id));
  const nextNeeded = neededRows.map((item) => {
    if (!moving.has(item.id)) return item;
    const id = queue.shift();
    return (id && byId.get(id)) || item;
  });
  return [...nextNeeded, ...boughtRows];
}

/** Links items to an invoice (a trip's total, its name, or both). */
export function withReceipt(
  purchases: Purchase[],
  itemIds: string[],
  receipt: { id: string; total?: number | null; name?: string | null },
): Purchase[] {
  const linked = new Set(itemIds);
  return purchases.map((item) => {
    if (!linked.has(item.id) && item.receiptId !== receipt.id) return item;
    return {
      ...item,
      receiptId: receipt.id,
      ...(receipt.total !== undefined ? { receiptTotal: receipt.total } : {}),
      ...(receipt.name !== undefined ? { receiptName: receipt.name } : {}),
    };
  });
}

/**
 * The invoice a "save this trip's total" belongs to: the one all these items
 * already share (and nothing else is on), like the server decides; otherwise null.
 */
export function sharedReceiptId(purchases: Purchase[], itemIds: string[]): string | null {
  const wanted = new Set(itemIds);
  const rows = purchases.filter((item) => wanted.has(item.id));
  const first = rows[0]?.receiptId;
  if (!first || rows.some((item) => item.receiptId !== first)) return null;
  const others = purchases.some((item) => item.receiptId === first && !wanted.has(item.id));
  return others ? null : first;
}

/**
 * A photo picked on this phone stays on screen from the local file while the
 * server still has that same photo; it avoids a blank flash after upload.
 */
export function keepLocalPhotos(next: Purchase[], current: Purchase[] | undefined): Purchase[] {
  const local = new Map(
    (current ?? [])
      .filter((item) => item.localImageUri && item.imageId && !item.photoUploading)
      .map((item) => [item.id, item]),
  );
  if (local.size === 0) return next;
  return next.map((item) => {
    const mine = local.get(item.id);
    return mine && mine.imageId === item.imageId
      ? { ...item, localImageUri: mine.localImageUri }
      : item;
  });
}
