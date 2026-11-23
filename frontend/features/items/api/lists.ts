import type { Purchase } from "@/features/items/types/purchase";
import { newId } from "@/features/offline/ids";
import { defineChange, perform } from "@/features/offline/outbox";
import { qk, readCache, writeCache } from "@/features/offline/query-client";
import { readThrough } from "@/features/offline/read";
import { isAlreadyGone } from "@/features/offline/rules";
import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";

export type HomeList = {
  id: string;
  homeId: string;
  name: string;
};

export type HistoryList = {
  id: string;
  name: string;
  deleted: boolean;
};

const DEFAULT_LIST_NAMES = new Set(["List", "قائمة"]);

export function listLabel(name: string, defaultLabel: string) {
  return DEFAULT_LIST_NAMES.has(name) ? defaultLabel : name;
}

export async function fetchLists(homeId: string) {
  const result = await readThrough<HomeList[]>(qk.lists(homeId), () =>
    api.get<HomeList[]>(`/homes/${homeId}/lists`),
  );
  if (result.data) return { lists: result.data, error: null };
  return { lists: [] as HomeList[], error: formatAppError(result.error) };
}

export async function fetchHistoryLists(homeId: string) {
  const result = await readThrough<HistoryList[]>(qk.historyLists(homeId), () =>
    api.get<HistoryList[]>(`/homes/${homeId}/history-lists`),
  );
  if (result.data) return { lists: result.data, error: null };
  return { lists: [] as HistoryList[], error: formatAppError(result.error) };
}

const createChange = defineChange<{ homeId: string; id: string; name: string }, HomeList>(
  "list.create",
  (payload) =>
    api.post<HomeList>(`/homes/${payload.homeId}/lists`, { id: payload.id, name: payload.name }),
);

const renameChange = defineChange<{ homeId: string; listId: string; name: string }, HomeList>(
  "list.rename",
  (payload) =>
    api.patch<HomeList>(`/homes/${payload.homeId}/lists/${payload.listId}`, { name: payload.name }),
);

const deleteChange = defineChange<{ homeId: string; listId: string }>(
  "list.delete",
  (payload) => api.delete(`/homes/${payload.homeId}/lists/${payload.listId}`),
  // Already deleted on another phone is what was asked for.
  { tolerate: isAlreadyGone },
);

function changeLists(homeId: string, change: (lists: HomeList[]) => HomeList[]) {
  writeCache<HomeList[]>(qk.lists(homeId), (current) => (current ? change(current) : current));
}

/** Creates a list under an id made here, so it also works with no internet. */
export async function createList(homeId: string, name: string) {
  const list: HomeList = { id: newId(), homeId, name: name.trim() };
  changeLists(homeId, (lists) => [...lists, list]);
  const result = await perform(createChange, { homeId, id: list.id, name: list.name }, {
    action: "add",
    title: list.name,
  });
  if (result.error) {
    changeLists(homeId, (lists) => lists.filter((entry) => entry.id !== list.id));
    return { list: null, error: result.error };
  }
  return { list: result.data ?? list, error: null };
}

export async function renameList(homeId: string, listId: string, name: string) {
  const next = name.trim();
  const previous = readCache<HomeList[]>(qk.lists(homeId))?.find((entry) => entry.id === listId);
  const rename = (to: string) => {
    changeLists(homeId, (lists) =>
      lists.map((entry) => (entry.id === listId ? { ...entry, name: to } : entry)),
    );
    // Items carry their list's name (history, the widget).
    writeCache<Purchase[]>(qk.items(homeId), (items) =>
      items?.map((item) => (item.listId === listId ? { ...item, listName: to } : item)),
    );
  };
  rename(next);
  const result = await perform(renameChange, { homeId, listId, name: next }, {
    action: "edit",
    title: next,
  });
  if (result.error) {
    if (previous) rename(previous.name);
    return { list: null, error: result.error };
  }
  return { list: result.data ?? { id: listId, homeId, name: next }, error: null };
}

export async function deleteList(homeId: string, listId: string) {
  const lists = readCache<HomeList[]>(qk.lists(homeId));
  const items = readCache<Purchase[]>(qk.items(homeId));
  const title = lists?.find((entry) => entry.id === listId)?.name;
  changeLists(homeId, (current) => current.filter((entry) => entry.id !== listId));
  // Like the server: what was still needed on the list goes with it.
  writeCache<Purchase[]>(qk.items(homeId), (current) =>
    current?.filter((item) => !(item.listId === listId && item.status === "needed")),
  );
  const result = await perform(deleteChange, { homeId, listId }, {
    action: "delete",
    ...(title ? { title } : { count: 1 }),
  });
  if (result.error) {
    if (lists) writeCache<HomeList[]>(qk.lists(homeId), lists);
    if (items) writeCache<Purchase[]>(qk.items(homeId), items);
  }
  return { error: result.error };
}
