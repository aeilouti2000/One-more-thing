import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";
import type { Purchase, PurchaseCategory } from "@/types/purchase";

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
  "name" | "quantity" | "category" | "urgent" | "notes"
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
    const items = await api.get<ItemResponse[]>(`/homes/${homeId}/items`);
    return { items: items.map(toPurchase), error: null };
  } catch (error) {
    return { items: [] as Purchase[], error: formatAppError(error) };
  }
}

export async function addItem(input: NewItemInput) {
  try {
    await api.post(`/homes/${input.homeId}/items`, {
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
      notes: input.notes?.trim() || undefined,
      unit: input.unit?.trim() || undefined,
      urgent: input.urgent === true,
      listId: input.listId,
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
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

export async function undoItemBought(itemId: string) {
  try {
    await api.post(`/items/${itemId}/needed`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function markItemBought(itemId: string, cost?: number | null) {
  try {
    await api.post(`/items/${itemId}/bought`, { cost: cost ?? null });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function markItemsBought(entries: BoughtCostEntry[]) {
  if (entries.length === 0) return { error: null };
  try {
    await api.post("/items/bought", {
      items: entries.map((entry) => ({
        id: entry.id,
        cost: entry.cost ?? null,
      })),
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

export async function moveItems(itemIds: string[], listId: string) {
  if (itemIds.length === 0) return { error: null };
  try {
    await api.post("/items/move", { ids: itemIds, listId });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
