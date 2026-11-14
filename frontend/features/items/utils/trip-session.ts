import "@/features/auth/utils/session-storage";

/**
 * A trip in progress, kept on the phone so it survives the app closing.
 * Without it the end-of-trip steps (prices, name, summary) would forget the
 * items checked off before the app closed.
 */
export type StoredTrip = {
  homeId: string;
  listId: string;
  listName: string;
  category: string | null;
  startedAt: number;
  lastActivityAt: number;
  /** Items this person checked off on this trip. */
  boughtIds: string[];
  /** Names as they were when checked off (id, name). */
  names: [string, string][];
  /** People seen shopping the same list on this trip. */
  partners: string[];
};

const TRIP_PREFIX = "one-more-thing.trip.";
const HOLD_TIP_KEY = "one-more-thing.trip-hold-tip-seen";
/** A trip not ended for this long is forgotten when auto-end is off. */
const DEFAULT_KEEP_HOURS = 8;

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Some runtimes have no localStorage; trips then just aren't kept.
  }
  return null;
}

export function readStoredTrip(homeId: string): StoredTrip | null {
  try {
    const raw = storage()?.getItem(`${TRIP_PREFIX}${homeId}`);
    if (!raw) return null;
    const trip = JSON.parse(raw) as StoredTrip;
    if (trip.homeId !== homeId || !trip.listId || !Array.isArray(trip.boughtIds)) return null;
    return {
      ...trip,
      names: Array.isArray(trip.names) ? trip.names : [],
      partners: Array.isArray(trip.partners) ? trip.partners : [],
    };
  } catch {
    return null;
  }
}

export function writeStoredTrip(trip: StoredTrip) {
  try {
    storage()?.setItem(`${TRIP_PREFIX}${trip.homeId}`, JSON.stringify(trip));
  } catch {
    // Not kept: the trip still works, it just can't be continued later.
  }
}

export function clearStoredTrip(homeId: string) {
  try {
    storage()?.removeItem(`${TRIP_PREFIX}${homeId}`);
  } catch {
    // Nothing to clear.
  }
}

/** Too old to continue: past the home's auto-end time (or 8 hours). */
export function isStoredTripStale(
  trip: StoredTrip,
  autoEndHours: number | null | undefined,
  now = Date.now(),
) {
  const hours = autoEndHours ?? DEFAULT_KEEP_HOURS;
  return now - trip.lastActivityAt > hours * 3_600_000;
}

export function holdTipSeen() {
  try {
    return storage()?.getItem(HOLD_TIP_KEY) === "1";
  } catch {
    return true;
  }
}

export function markHoldTipSeen() {
  try {
    storage()?.setItem(HOLD_TIP_KEY, "1");
  } catch {
    // Shown again next time; harmless.
  }
}

// The Items screen asks "Continue your trip?" once per app start, and never
// while the trip page itself is open.
let tripPageOpen = false;
const askedHomes = new Set<string>();

export function setTripPageOpen(open: boolean) {
  tripPageOpen = open;
}

export function canAskToResume(homeId: string) {
  return !tripPageOpen && !askedHomes.has(homeId);
}

export function markResumeAsked(homeId: string) {
  askedHomes.add(homeId);
}
