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

export function listLabel(name: string, defaultLabel: string) {
  return name === "List" ? defaultLabel : name;
}

export async function fetchLists(homeId: string) {
  try {
    const lists = await api.get<HomeList[]>(`/homes/${homeId}/lists`);
    return { lists, error: null };
  } catch (error) {
    return { lists: [] as HomeList[], error: formatAppError(error) };
  }
}

export async function fetchHistoryLists(homeId: string) {
  try {
    const lists = await api.get<HistoryList[]>(`/homes/${homeId}/history-lists`);
    return { lists, error: null };
  } catch (error) {
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
