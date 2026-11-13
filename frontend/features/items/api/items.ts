import { File } from "expo-file-system";
import { Platform } from "react-native";
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
  createdAt: string;
  boughtAt: string | null;
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
    createdAt: item.createdAt,
    boughtAt: item.boughtAt ?? undefined,
  };
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
    await api.patch(`/items/${itemId}`, body);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function updateItemCost(itemId: string, cost: number | null) {
  try {
    await api.patch(`/items/${itemId}/cost`, { cost });
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
    await api.post(`/items/${itemId}/receipt`, {
      receiptId,
      utcOffsetMin: -new Date().getTimezoneOffset(),
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function undoItemBought(itemId: string) {
  try {
    await api.post(`/items/${itemId}/needed`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function markItemBought(itemId: string, cost?: number | null, receiptId?: string | null) {
  try {
    await api.post(`/items/${itemId}/bought`, {
      cost: cost ?? null,
      ...(receiptId ? { receiptId } : {}),
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function markItemsBought(entries: BoughtCostEntry[], receiptId?: string | null) {
  if (entries.length === 0) return { error: null };
  try {
    await api.post("/items/bought", {
      items: entries.map((entry) => ({
        id: entry.id,
        cost: entry.cost ?? null,
      })),
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
    await api.post("/items/order", { ids: itemIds });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function deleteItems(itemIds: string[]) {
  if (itemIds.length === 0) return { error: null };
  try {
    await api.post("/items/delete", { ids: itemIds });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function setItemsUrgent(itemIds: string[], urgent: boolean) {
  if (itemIds.length === 0) return { error: null };
  try {
    await api.post("/items/urgent", { ids: itemIds, urgent });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function moveItems(itemIds: string[], listId: string) {
  if (itemIds.length === 0) return { error: null };
  try {
    await api.post("/items/move", { ids: itemIds, listId });
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
    const type = photo.mimeType || "image/jpeg";
    const name = photo.fileName || `item-${itemId}.jpg`;
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
    const updated = await api.upload<ItemResponse>(`/items/${itemId}/image`, form);
    return { item: toPurchase(updated), error: null };
  } catch (error) {
    return { item: null as Purchase | null, error: formatAppError(error) };
  }
}

export async function removeItemImage(itemId: string) {
  try {
    const updated = await api.delete<ItemResponse>(`/items/${itemId}/image`);
    return { item: toPurchase(updated), error: null };
  } catch (error) {
    return { item: null as Purchase | null, error: formatAppError(error) };
  }
}
