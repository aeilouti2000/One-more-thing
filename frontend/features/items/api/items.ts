import { File } from "expo-file-system";
import { Platform } from "react-native";
import { translate } from "@/constants/i18n";
import { emitListChanged } from "@/features/items/utils/list-sync";
import { api, apiUrl } from "@/lib/api";
import { formatAppError, isOfflineError } from "@/lib/errors";
import { readCachedItems } from "@/features/offline/profile-cache";
import type { Purchase, PurchaseCategory } from "@/features/items/types/purchase";

export type NewItemInput = {
  homeId: string;
  userId: string;
  name: string;
  quantity: number;
  category: PurchaseCategory;
  notes?: string;
  unit?: string;
  urgent?: boolean;
  listId?: string;
};

export type UpdateItemInput = Pick<
  NewItemInput,
  "name" | "quantity" | "category" | "urgent" | "notes" | "unit"
>;

export type BoughtCostEntry = {
  id: string;
  cost?: number | null;
};

type ItemResponse = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: PurchaseCategory;
  notes: string | null;
  status: Purchase["status"];
  urgent: boolean;
  cost?: number | null;
  receiptId?: string | null;
  receiptTotal?: number | string | null;
  receiptName?: string | null;
  imageId?: string | null;
  listId?: string;
  listName?: string;
  addedByName: string;
  boughtByName: string | null;
  boughtBy?: string | null;
  createdAt: string;
  boughtAt: string | null;
  notFoundAt?: string | null;
  notFoundBy?: string | null;
  notFoundByName?: string | null;
};

function toPurchase(item: ItemResponse): Purchase {
  const quantity = Number(item.quantity);
  const cost =
    item.cost === null || item.cost === undefined
      ? null
      : Number.isFinite(Number(item.cost))
        ? Number(item.cost)
        : null;
  return {
    id: item.id,
    name: item.name,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: item.unit ?? undefined,
    category: item.category,
    notes: item.notes ?? undefined,
    status: item.status,
    urgent: Boolean(item.urgent),
    cost,
    receiptId: item.receiptId ?? null,
    receiptTotal:
      item.receiptTotal === null || item.receiptTotal === undefined
        ? null
        : Number.isFinite(Number(item.receiptTotal))
          ? Number(item.receiptTotal)
          : null,
    receiptName: item.receiptName ?? null,
    imageId: item.imageId ?? null,
    listId: item.listId,
    listName: item.listName,
    addedByName: item.addedByName,
    boughtByName: item.boughtByName ?? undefined,
    boughtById: item.boughtBy ?? undefined,
    createdAt: item.createdAt,
    boughtAt: item.boughtAt ?? undefined,
    notFoundAt: item.notFoundAt ?? undefined,
    notFoundById: item.notFoundBy ?? undefined,
    notFoundByName: item.notFoundByName ?? undefined,
  };
}

/**
 * Rows shown at once, before the server has saved them, carry a temporary id.
 * An action on such a row (check it off, reorder, delete) waits here for the
 * save and then uses the real id, instead of sending an id the server rejects.
 */
const pendingSaves = new Map<string, Promise<string | null>>();

export function isUnsavedItemId(id: string) {
  return id.startsWith("temp-");
}

/** `saved` resolves to the real id, or null when the item could not be added. */
export function trackUnsavedItem(tempId: string, saved: Promise<string | null>) {
  pendingSaves.set(tempId, saved);
  // Long after the row has its real id, nothing asks for the temporary one.
  void saved.finally(() => setTimeout(() => pendingSaves.delete(tempId), 60_000));
}

async function savedItemId(id: string) {
  if (!isUnsavedItemId(id)) return id;
  const real = await pendingSaves.get(id);
  if (!real) throw new Error(translate("errorGeneric"));
  // The row was replaced by the saved item meanwhile: reload so the screen
  // shows this action on it.
  setTimeout(emitListChanged, 0);
  return real;
}

async function savedItemIds(ids: string[]) {
  const real = await Promise.all(ids.map((id) => savedItemId(id).catch(() => null)));
  return real.filter((id): id is string => id !== null);
}

export async function fetchHomeItems(homeId: string) {
  try {
    const items = (await api.get<ItemResponse[]>(`/homes/${homeId}/items`)).map(toPurchase);
    return { items, error: null };
  } catch (error) {
    if (isOfflineError(error)) {
      const cached = readCachedItems(homeId);
      if (cached) return { items: cached, error: null };
    }
    return { items: [] as Purchase[], error: formatAppError(error) };
  }
}

export async function addItem(input: NewItemInput) {
  try {
    const created = await api.post<ItemResponse>(`/homes/${input.homeId}/items`, {
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
      notes: input.notes?.trim() || undefined,
      unit: input.unit?.trim() || undefined,
      urgent: input.urgent === true,
      listId: input.listId,
    });
    return { item: toPurchase(created), error: null };
  } catch (error) {
    return { item: null as Purchase | null, error: formatAppError(error) };
  }
}

export async function updateItemDetails(itemId: string, input: UpdateItemInput) {
  try {
    const id = await savedItemId(itemId);
    const body: {
      name: string;
      quantity: number;
      category: PurchaseCategory;
      urgent: boolean;
      notes?: string;
      unit?: string;
    } = {
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
      urgent: input.urgent === true,
    };
    // Only send notes when the caller provided them so quantity/urgent
    // updates do not wipe existing notes on the server.
    if (typeof input.notes === "string") {
      body.notes = input.notes.trim();
    }
    // Same for unit: omit keeps it, "" clears it.
    if (typeof input.unit === "string") {
      body.unit = input.unit.trim();
    }
    await api.patch(`/items/${id}`, body);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function updateItemCost(itemId: string, cost: number | null) {
  try {
    const id = await savedItemId(itemId);
    await api.patch(`/items/${id}/cost`, { cost });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

/**
 * Save an invoice for a trip and link its bought items to it. `total: null`
 * creates it without a total (a named trip, or a target to move items into).
 */
export async function createTripReceipt(
  homeId: string,
  input: { total: number | null; itemIds: string[]; listId?: string | null; name?: string | null },
) {
  try {
    const result = await api.post<{
      receipt: { id: string; total: number | null; name: string | null };
    }>(`/homes/${homeId}/receipts`, {
      total: input.total,
      itemIds: input.itemIds,
      ...(input.listId ? { listId: input.listId } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
    });
    return { receipt: result.receipt, error: null };
  } catch (error) {
    return { receipt: null, error: formatAppError(error) };
  }
}

export async function renameTripReceipt(receiptId: string, name: string | null) {
  try {
    await api.patch(`/receipts/${receiptId}`, { name: name?.trim() || null });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

/** Move a bought item to another invoice of the same month. */
export async function moveItemToReceipt(itemId: string, receiptId: string) {
  try {
    const id = await savedItemId(itemId);
    await api.post(`/items/${id}/receipt`, {
      receiptId,
      utcOffsetMin: -new Date().getTimezoneOffset(),
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

/** onlyMine: from a trip, so a partner's purchase is never taken back. */
export async function undoItemBought(itemId: string, options?: { onlyMine?: boolean }) {
  try {
    const id = await savedItemId(itemId);
    await api.post(`/items/${id}/needed`, options?.onlyMine ? { onlyMine: true } : undefined);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

/** Returns the item as the server has it: someone else may have bought it first. */
export async function markItemBought(itemId: string, cost?: number | null, receiptId?: string | null) {
  try {
    const id = await savedItemId(itemId);
    const item = await api.post<ItemResponse>(`/items/${id}/bought`, {
      cost: cost ?? null,
      ...(receiptId ? { receiptId } : {}),
    });
    return { item: item ? toPurchase(item) : null, error: null as string | null };
  } catch (error) {
    return { item: null as Purchase | null, error: formatAppError(error) };
  }
}

/** "Couldn't find it" in this shop (or put it back, with notFound false). */
export async function setItemNotFound(itemId: string, notFound: boolean) {
  try {
    const id = await savedItemId(itemId);
    const path = `/items/${id}/not-found`;
    const item = notFound
      ? await api.post<ItemResponse>(path)
      : await api.delete<ItemResponse>(path);
    return { item: item ? toPurchase(item) : null, error: null as string | null };
  } catch (error) {
    return { item: null as Purchase | null, error: formatAppError(error) };
  }
}

export async function markItemsBought(entries: BoughtCostEntry[], receiptId?: string | null) {
  if (entries.length === 0) return { error: null };
  try {
    const items: { id: string; cost: number | null }[] = [];
    for (const entry of entries) {
      const id = await savedItemId(entry.id).catch(() => null);
      if (id) items.push({ id, cost: entry.cost ?? null });
    }
    if (items.length === 0) return { error: null };
    await api.post("/items/bought", {
      items,
      ...(receiptId ? { receiptId } : {}),
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function reorderItems(itemIds: string[]) {
  if (itemIds.length === 0) return { error: null };
  try {
    const ids = await savedItemIds(itemIds);
    if (ids.length === 0) return { error: null };
    await api.post("/items/order", { ids });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function deleteItems(itemIds: string[]) {
  if (itemIds.length === 0) return { error: null };
  try {
    const ids = await savedItemIds(itemIds);
    if (ids.length === 0) return { error: null };
    await api.post("/items/delete", { ids });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function setItemsUrgent(itemIds: string[], urgent: boolean) {
  if (itemIds.length === 0) return { error: null };
  try {
    const ids = await savedItemIds(itemIds);
    if (ids.length === 0) return { error: null };
    await api.post("/items/urgent", { ids, urgent });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function setItemsCategory(itemIds: string[], category: PurchaseCategory) {
  if (itemIds.length === 0) return { error: null };
  try {
    const ids = await savedItemIds(itemIds);
    if (ids.length === 0) return { error: null };
    await api.post("/items/category", { ids, category });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

/** unit "" clears it (plain pieces). */
export async function setItemsUnit(itemIds: string[], unit: string) {
  if (itemIds.length === 0) return { error: null };
  try {
    const ids = await savedItemIds(itemIds);
    if (ids.length === 0) return { error: null };
    await api.post("/items/unit", { ids, unit });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function moveItems(itemIds: string[], listId: string) {
  if (itemIds.length === 0) return { error: null };
  try {
    const ids = await savedItemIds(itemIds);
    if (ids.length === 0) return { error: null };
    await api.post("/items/move", { ids, listId });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export type PickedPhoto = {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

/** Where <Image> loads an item photo from. */
export function itemImageUrl(imageId: string) {
  return apiUrl(`/item-images/${imageId}`);
}

/** Attach or replace an item's photo. The server resizes it. */
export async function uploadItemImage(itemId: string, photo: PickedPhoto) {
  try {
    const id = await savedItemId(itemId);
    const type = photo.mimeType || "image/jpeg";
    const name = photo.fileName || `item-${id}.jpg`;
    const form = new FormData();
    if (Platform.OS === "web") {
      // Web pickers hand back a blob:/data: URI; send the bytes themselves.
      const blob = await (await fetch(photo.uri)).blob();
      form.append("image", blob, name);
    } else {
      // Expo's fetch can't stream React Native's {uri} parts, but takes any
      // part with name, type and bytes(); read them straight from the file.
      const file = new File(photo.uri);
      form.append("image", {
        name,
        type,
        bytes: async () => new Uint8Array(await file.arrayBuffer()),
      } as unknown as Blob);
    }
    const updated = await api.upload<ItemResponse>(`/items/${id}/image`, form);
    return { item: toPurchase(updated), error: null };
  } catch (error) {
    return { item: null as Purchase | null, error: formatAppError(error) };
  }
}

export async function removeItemImage(itemId: string) {
  try {
    const id = await savedItemId(itemId);
    const updated = await api.delete<ItemResponse>(`/items/${id}/image`);
    return { item: toPurchase(updated), error: null };
  } catch (error) {
    return { item: null as Purchase | null, error: formatAppError(error) };
  }
}
