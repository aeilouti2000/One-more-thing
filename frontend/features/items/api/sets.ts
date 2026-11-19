import { emitListChanged } from "@/features/items/utils/list-sync";
import { readCachedSets, writeCachedSets } from "@/features/offline/profile-cache";
import type { PurchaseCategory } from "@/features/items/types/purchase";
import { api } from "@/lib/api";
import { formatAppError, isOfflineError } from "@/lib/errors";

/** The server's limits, mirrored so the app can say so before asking. */
export const SET_ITEM_LIMIT = 30;
export const SET_NAME_MAX = 60;

export type SetItem = {
  name: string;
  quantity: number;
  unit?: string;
  category: PurchaseCategory;
};

/** A saved group of items ("Friday BBQ") the home adds to a list in one tap. */
export type ItemSet = {
  id: string;
  name: string;
  items: SetItem[];
};

type SetResponse = {
  id: string;
  name: string;
  items: { name: string; quantity: number; unit: string | null; category: PurchaseCategory }[];
};

function toSet(row: SetResponse): ItemSet {
  return {
    id: row.id,
    name: row.name,
    items: (row.items ?? []).map((item) => {
      const quantity = Number(item.quantity);
      return {
        name: item.name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: item.unit ?? undefined,
        category: item.category,
      };
    }),
  };
}

function toBody(items: SetItem[]) {
  return items.map((item) => ({
    name: item.name.trim(),
    quantity: item.quantity,
    unit: item.unit?.trim() || null,
    category: item.category,
  }));
}

/** The sets last seen on this phone, so the page opens without a wait. */
export function cachedSets(homeId: string) {
  return readCachedSets<ItemSet>(homeId);
}

/**
 * Keeps the phone's copy in step with a change just saved, so the page opens
 * right next time (also offline) instead of showing the sets from before.
 */
function remember(homeId: string, change: (sets: ItemSet[]) => ItemSet[]) {
  const cached = readCachedSets<ItemSet>(homeId);
  if (cached) writeCachedSets(homeId, change(cached));
}

export async function fetchSets(homeId: string) {
  try {
    const sets = (await api.get<SetResponse[]>(`/homes/${homeId}/sets`)).map(toSet);
    writeCachedSets(homeId, sets);
    return { sets, error: null as string | null };
  } catch (error) {
    if (isOfflineError(error)) {
      const cached = readCachedSets<ItemSet>(homeId);
      if (cached) return { sets: cached, error: null };
    }
    return { sets: null as ItemSet[] | null, error: formatAppError(error) };
  }
}

export async function createSet(homeId: string, name: string, items: SetItem[]) {
  try {
    const set = toSet(
      await api.post<SetResponse>(`/homes/${homeId}/sets`, { name: name.trim(), items: toBody(items) }),
    );
    remember(homeId, (sets) => [...sets, set]);
    return { set, error: null as string | null };
  } catch (error) {
    return { set: null as ItemSet | null, error: formatAppError(error) };
  }
}

export async function updateSet(
  homeId: string,
  setId: string,
  changes: { name?: string; items?: SetItem[] },
) {
  try {
    const set = toSet(
      await api.patch<SetResponse>(`/sets/${setId}`, {
        ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
        ...(changes.items !== undefined ? { items: toBody(changes.items) } : {}),
      }),
    );
    remember(homeId, (sets) => sets.map((entry) => (entry.id === set.id ? set : entry)));
    return { set, error: null as string | null };
  } catch (error) {
    return { set: null as ItemSet | null, error: formatAppError(error) };
  }
}

export async function deleteSet(homeId: string, setId: string) {
  try {
    await api.delete(`/sets/${setId}`);
    remember(homeId, (sets) => sets.filter((entry) => entry.id !== setId));
    return { error: null as string | null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

/**
 * Puts the set's items on a list. `added` are new on the list, `restored`
 * came back from the Later shelf, `skipped` were already there.
 */
export async function addSetToList(setId: string, listId: string | null) {
  try {
    const result = await api.post<{ added: unknown[]; restored: string[]; skipped: number }>(
      `/sets/${setId}/add`,
      listId ? { listId } : undefined,
    );
    // The list changed on the server: every screen showing it reloads.
    emitListChanged();
    return {
      added: result.added.length + result.restored.length,
      skipped: result.skipped,
      error: null as string | null,
    };
  } catch (error) {
    return { added: 0, skipped: 0, error: formatAppError(error) };
  }
}
