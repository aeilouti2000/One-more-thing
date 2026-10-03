import "@/lib/session-storage";

const LIST_STORAGE_PREFIX = "one-more-thing.last-list.";

function storage() {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // SSR and some native runtimes do not expose localStorage.
  }
  return null;
}

function keyFor(homeId: string) {
  return `${LIST_STORAGE_PREFIX}${homeId}`;
}

export function readStoredListId(homeId: string): string | null {
  try {
    const value = storage()?.getItem(keyFor(homeId));
    return value?.trim() || null;
  } catch {
    return null;
  }
}

export function writeStoredListId(homeId: string, listId: string) {
  try {
    storage()?.setItem(keyFor(homeId), listId);
  } catch {
    // Keep the active in-memory selection when persistence is unavailable.
  }
}

export function resolvePreferredListId(
  lists: { id: string }[],
  homeId: string,
): string | null {
  const stored = readStoredListId(homeId);
  if (stored && lists.some((list) => list.id === stored)) {
    return stored;
  }
  return lists[0]?.id ?? null;
}
