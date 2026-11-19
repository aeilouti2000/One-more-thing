import "@/features/auth/utils/session-storage";
import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";

/** Which kinds of list notification this person wants. */
export type NotificationPrefs = {
  added: boolean;
  urgent: boolean;
  due: boolean;
  /** Someone at the shop asks the home if anything is missing. */
  shopping: boolean;
  /** An item parked for later is back on the list. */
  later: boolean;
};

export const NOTIFICATION_KINDS = ["added", "urgent", "shopping", "due", "later"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const ALL_ON: NotificationPrefs = {
  added: true,
  urgent: true,
  due: true,
  shopping: true,
  later: true,
};
const CACHE_KEY = "omt.push.prefs";

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Native and server renders can hide localStorage.
  }
  return null;
}

function clean(value: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  return {
    added: value?.added !== false,
    urgent: value?.urgent !== false,
    due: value?.due !== false,
    // Missing on an older server: on, like every other kind.
    shopping: value?.shopping !== false,
    later: value?.later !== false,
  };
}

/** The last choices seen on this phone, so the page opens without a wait. */
export function readCachedNotificationPrefs(): NotificationPrefs {
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    return raw ? clean(JSON.parse(raw) as Partial<NotificationPrefs>) : ALL_ON;
  } catch {
    return ALL_ON;
  }
}

function remember(prefs: NotificationPrefs) {
  storage()?.setItem(CACHE_KEY, JSON.stringify(prefs));
  return prefs;
}

export async function fetchNotificationPrefs() {
  try {
    const prefs = remember(clean(await api.get<NotificationPrefs>("/notifications/preferences")));
    return { prefs, error: null };
  } catch (error) {
    return { prefs: null, error: formatAppError(error) };
  }
}

export async function updateNotificationPrefs(patch: Partial<NotificationPrefs>) {
  try {
    const prefs = remember(
      clean(await api.patch<NotificationPrefs>("/notifications/preferences", patch)),
    );
    return { prefs, error: null };
  } catch (error) {
    return { prefs: null, error: formatAppError(error) };
  }
}
