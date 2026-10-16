import { api } from "@/lib/api";
import { formatAppError, isOfflineError } from "@/lib/errors";
import {
  readCachedHistoryLists,
  readCachedLists,
  writeCachedHistoryLists,
  writeCachedLists,
} from "@/features/offline/profile-cache";

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
  try {
    const lists = await api.get<HomeList[]>(`/homes/${homeId}/lists`);
    writeCachedLists(homeId, lists);
    return { lists, error: null };
  } catch (error) {
    if (isOfflineError(error)) {
      const cached = readCachedLists<HomeList>(homeId);
      if (cached) return { lists: cached, error: null };
    }
    return { lists: [] as HomeList[], error: formatAppError(error) };
  }
}

export async function fetchHistoryLists(homeId: string) {
  try {
    const lists = await api.get<HistoryList[]>(`/homes/${homeId}/history-lists`);
    writeCachedHistoryLists(homeId, lists);
    return { lists, error: null };
  } catch (error) {
    if (isOfflineError(error)) {
      const cached = readCachedHistoryLists<HistoryList>(homeId);
      if (cached) return { lists: cached, error: null };
    }
    return { lists: [] as HistoryList[], error: formatAppError(error) };
  }
}

export async function createList(homeId: string, name: string) {
  try {
    const list = await api.post<HomeList>(`/homes/${homeId}/lists`, { name: name.trim() });
    return { list, error: null };
  } catch (error) {
    return { list: null, error: formatAppError(error) };
  }
}

export async function renameList(homeId: string, listId: string, name: string) {
  try {
    const list = await api.patch<HomeList>(`/homes/${homeId}/lists/${listId}`, { name: name.trim() });
    return { list, error: null };
  } catch (error) {
    return { list: null, error: formatAppError(error) };
  }
}

export async function deleteList(homeId: string, listId: string) {
  try {
    await api.delete(`/homes/${homeId}/lists/${listId}`);
    return { error: null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
