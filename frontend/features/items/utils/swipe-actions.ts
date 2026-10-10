import "@/features/auth/utils/session-storage";

const STORAGE_KEY = "one-more-thing.swipe-actions";

export const SWIPE_ACTION_IDS = ["buy", "pin", "move", "urgent", "delete"] as const;

export type SwipeAction = (typeof SWIPE_ACTION_IDS)[number];

export const SWIPE_ACTION_TONE: Record<SwipeAction, { bg: string; fg: string }> = {
  buy: { bg: "#BBF7D0", fg: "#166534" },
  pin: { bg: "#DDD6FE", fg: "#5B21B6" },
  move: { bg: "#BFDBFE", fg: "#1E3A8A" },
  urgent: { bg: "#FDE68A", fg: "#92400E" },
  delete: { bg: "#FECACA", fg: "#B91C1C" },
};

export type SwipeActionPrefs = {
  left: SwipeAction;
  right: SwipeAction;
};

const DEFAULT_PREFS: SwipeActionPrefs = {
  left: "delete",
  right: "buy",
};

const listeners = new Set<(prefs: SwipeActionPrefs) => void>();

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Native runtimes may not expose localStorage.
  }
  return null;
}

function isAction(value: unknown): value is SwipeAction {
  return SWIPE_ACTION_IDS.some((action) => action === value);
}

export function readSwipeActions(): SwipeActionPrefs {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SwipeActionPrefs>;
    const left = isAction(parsed.left) ? parsed.left : DEFAULT_PREFS.left;
    let right = isAction(parsed.right) ? parsed.right : DEFAULT_PREFS.right;
    if (right === left) {
      right = SWIPE_ACTION_IDS.find((action) => action !== left) ?? DEFAULT_PREFS.right;
    }
    return { left, right };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeSwipeActions(next: SwipeActionPrefs) {
  const prefs = next.left === next.right ? readSwipeActions() : next;
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Keep the in-memory choice when persistence is unavailable.
  }
  for (const listener of listeners) listener(prefs);
  return prefs;
}

export function subscribeSwipeActions(listener: (prefs: SwipeActionPrefs) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
