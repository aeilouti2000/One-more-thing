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
};

export type UpdateItemInput = Pick<NewItemInput, "name" | "quantity" | "category" | "urgent">;

type ItemResponse = {
  id: string;
  name: string;
  quantity: number;
  unit: string | null;
  category: PurchaseCategory;
  notes: string | null;
  status: Purchase["status"];
  urgent: boolean;
  addedByName: string;
  boughtByName: string | null;
  createdAt: string;
  boughtAt: string | null;
};

function toPurchase(item: ItemResponse): Purchase {
  const quantity = Number(item.quantity);
  return {
    id: item.id,
    name: item.name,
    quantity: Number.isFinite(quantity) ? quantity : 1,
    unit: item.unit ?? undefined,
    category: item.category,
    notes: item.notes ?? undefined,
    status: item.status,
    urgent: Boolean(item.urgent),
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
    });
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function updateItemDetails(itemId: string, input: UpdateItemInput) {
  try {
    await api.patch(`/items/${itemId}`, {
      name: input.name.trim(),
      quantity: input.quantity,
      category: input.category,
      urgent: input.urgent === true,
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

export async function markItemBought(itemId: string) {
  try {
    await api.post(`/items/${itemId}/bought`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export async function markItemsBought(itemIds: string[]) {
  if (itemIds.length === 0) return { error: null };
  try {
    await api.post("/items/bought", { ids: itemIds });
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
