import "@/features/auth/utils/session-storage";

const DISMISSED_KEY = "one-more-thing.recap-dismissed";

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Native runtimes may not expose localStorage.
  }
  return null;
}

/** Whether this phone closed the recap card for that home and month. */
export function recapDismissed(homeId: string, month: string) {
  try {
    return storage()?.getItem(`${DISMISSED_KEY}.${homeId}`) === month;
  } catch {
    return false;
  }
}

export function dismissRecap(homeId: string, month: string) {
  try {
    storage()?.setItem(`${DISMISSED_KEY}.${homeId}`, month);
  } catch {
    // Not saved: the card may come back next launch, harmless.
  }
}
