import "@/features/auth/utils/session-storage";

const CLOSED_KEY = "one-more-thing.history-notice-closed";

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Native runtimes may not expose localStorage.
  }
  return null;
}

/** Whether this phone closed the History period notice for that home and waiting change. */
export function historyNoticeClosed(homeId: string, key: string) {
  try {
    return storage()?.getItem(`${CLOSED_KEY}.${homeId}`) === key;
  } catch {
    return false;
  }
}

export function closeHistoryNotice(homeId: string, key: string) {
  try {
    storage()?.setItem(`${CLOSED_KEY}.${homeId}`, key);
  } catch {
    // Not saved: the notice may come back next launch, harmless.
  }
}
