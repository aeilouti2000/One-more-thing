import { addItem, cachedItems, clearItemsLater } from "@/features/items/api/items";
import { emitListChanged } from "@/features/items/utils/list-sync";
import { normalizeName } from "@/features/items/utils/insights";
import type { PurchaseCategory } from "@/features/items/types/purchase";
import { newId } from "@/features/offline/ids";
import { isOnline } from "@/features/offline/network";
import { defineChange, hasPending, perform } from "@/features/offline/outbox";
import { qk, queryClient, readCache, writeCache } from "@/features/offline/query-client";
import { readThrough } from "@/features/offline/read";
import { isAlreadyGone } from "@/features/offline/rules";
import { api, readSession } from "@/lib/api";
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

export type SetResponse = {
  id: string;
  name: string;
  items: { name: string; quantity: number; unit: string | null; category: PurchaseCategory }[];
};

export function toSet(row: SetResponse): ItemSet {
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
  return readCache<ItemSet[]>(qk.sets(homeId)) ?? null;
}

function changeSets(homeId: string, change: (sets: ItemSet[]) => ItemSet[]) {
  writeCache<ItemSet[]>(qk.sets(homeId), (current) => (current ? change(current) : current));
}

export async function fetchSets(homeId: string) {
  const result = await readThrough<ItemSet[]>(qk.sets(homeId), async () =>
    (await api.get<SetResponse[]>(`/homes/${homeId}/sets`)).map(toSet),
  );
  if (result.data) return { sets: result.data, error: null as string | null };
  return { sets: null as ItemSet[] | null, error: formatAppError(result.error) };
}

type SetBody = { name?: string; items?: ReturnType<typeof toBody> };

const createChange = defineChange<{ homeId: string; body: SetBody & { id: string } }, SetResponse>(
  "set.create",
  (payload) => api.post<SetResponse>(`/homes/${payload.homeId}/sets`, payload.body),
);

const updateChange = defineChange<{ setId: string; body: SetBody }, SetResponse>(
  "set.update",
  (payload) => api.patch<SetResponse>(`/sets/${payload.setId}`, payload.body),
);

const deleteChange = defineChange<{ setId: string }>(
  "set.delete",
  (payload) => api.delete(`/sets/${payload.setId}`),
  // Already deleted on another phone is what was asked for.
  { tolerate: isAlreadyGone },
);

/** What the server would keep of these items (names trimmed, units cleaned). */
function asSaved(items: SetItem[]): SetItem[] {
  return items.map((item) => ({
    name: item.name.trim(),
    quantity: item.quantity,
    unit: item.unit?.trim() || undefined,
    category: item.category,
  }));
}

export async function createSet(homeId: string, name: string, items: SetItem[]) {
  const set: ItemSet = { id: newId(), name: name.trim(), items: asSaved(items) };
  changeSets(homeId, (sets) => [...sets, set]);
  const result = await perform(
    createChange,
    { homeId, body: { id: set.id, name: set.name, items: toBody(items) } },
    { action: "add", title: set.name },
  );
  if (result.error) {
    changeSets(homeId, (sets) => sets.filter((entry) => entry.id !== set.id));
    return { set: null as ItemSet | null, error: result.error };
  }
  const saved = result.data ? toSet(result.data) : set;
  if (result.data) {
    changeSets(homeId, (sets) => sets.map((entry) => (entry.id === set.id ? saved : entry)));
  }
  return { set: saved, error: null as string | null };
}

export async function updateSet(
  homeId: string,
  setId: string,
  changes: { name?: string; items?: SetItem[] },
) {
  const before = readCache<ItemSet[]>(qk.sets(homeId));
  const previous = before?.find((entry) => entry.id === setId);
  const next: ItemSet = {
    id: setId,
    name: changes.name !== undefined ? changes.name.trim() : (previous?.name ?? ""),
    items: changes.items !== undefined ? asSaved(changes.items) : (previous?.items ?? []),
  };
  changeSets(homeId, (sets) => sets.map((entry) => (entry.id === setId ? next : entry)));
  const result = await perform(
    updateChange,
    {
      setId,
      body: {
        ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
        ...(changes.items !== undefined ? { items: toBody(changes.items) } : {}),
      },
    },
    { action: "edit", title: next.name || undefined },
  );
  if (result.error) {
    if (before) writeCache<ItemSet[]>(qk.sets(homeId), before);
    return { set: null as ItemSet | null, error: result.error };
  }
  const saved = result.data ? toSet(result.data) : next;
  if (result.data) {
    changeSets(homeId, (sets) => sets.map((entry) => (entry.id === setId ? saved : entry)));
  }
  return { set: saved, error: null as string | null };
}

export async function deleteSet(homeId: string, setId: string) {
  const before = readCache<ItemSet[]>(qk.sets(homeId));
  const title = before?.find((entry) => entry.id === setId)?.name;
  changeSets(homeId, (sets) => sets.filter((entry) => entry.id !== setId));
  const result = await perform(deleteChange, { setId }, {
    action: "delete",
    ...(title ? { title } : { count: 1 }),
  });
  if (result.error && before) writeCache<ItemSet[]>(qk.sets(homeId), before);
  return { error: result.error };
}

function findSet(setId: string) {
  for (const [key, sets] of queryClient.getQueriesData<ItemSet[]>({ queryKey: ["sets"] })) {
    const set = Array.isArray(sets) ? sets.find((entry) => entry.id === setId) : undefined;
    if (set && typeof key[1] === "string") return { homeId: key[1], set };
  }
  return null;
}

/**
 * The same as the server's "add set to list", done on this phone: used with no
 * internet (or while other changes are still waiting), so the items are on the
 * list at once and are sent with the rest.
 */
async function addSetLocally(setId: string, listId: string | null) {
  const found = findSet(setId);
  const user = readSession()?.user;
  if (!found || !user) return null;
  const { homeId, set } = found;
  const target = listId ?? readCache<{ id: string }[]>(qk.lists(homeId))?.[0]?.id;
  if (!target) return null;
  const usable = new Set(
    (readCache<{ id: string }[]>(qk.categories(homeId)) ?? []).map((category) => category.id),
  );
  const onList = new Map(
    (cachedItems(homeId) ?? [])
      .filter((item) => item.status === "needed" && item.listId === target)
      .map((item) => [normalizeName(item.name), item]),
  );
  const restoreIds: string[] = [];
  const fresh: SetItem[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const item of set.items) {
    const key = normalizeName(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = onList.get(key);
    if (!existing) fresh.push(item);
    else if (existing.laterAt) restoreIds.push(existing.id);
    else skipped += 1;
  }
  for (const item of fresh) {
    void addItem({
      homeId,
      userId: user.id,
      addedByName: user.name,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      // A category removed since the set was saved: "Other", like the server.
      category: usable.size === 0 || usable.has(item.category) ? item.category : "other",
      listId: target,
    });
  }
  if (restoreIds.length > 0) void clearItemsLater(restoreIds);
  return { added: fresh.length + restoreIds.length, skipped, error: null as string | null };
}

/**
 * Puts the set's items on a list. `added` are new on the list, `restored`
 * came back from the Later shelf, `skipped` were already there.
 */
export async function addSetToList(setId: string, listId: string | null) {
  if (!isOnline() || hasPending()) {
    const local = await addSetLocally(setId, listId);
    if (local) {
      emitListChanged();
      return local;
    }
  }
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
    if (isOfflineError(error)) {
      // The connection dropped just now: do it on the phone instead.
      const local = await addSetLocally(setId, listId);
      if (local) {
        emitListChanged();
        return local;
      }
    }
    return { added: 0, skipped: 0, error: formatAppError(error) };
  }
}
