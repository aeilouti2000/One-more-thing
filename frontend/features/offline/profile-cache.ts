import "@/features/auth/utils/session-storage";
import type { HomeSummary, Household } from "@/features/homes/types/household";
import type { Purchase } from "@/features/items/types/purchase";

const SESSION_KEY = "omt.session";
const PREFIX = "omt.profile.v1.";

type ProfileSnapshot = {
  householdKnown: boolean;
  household: Household | null;
  homes: HomeSummary[];
  items: Record<string, Purchase[]>;
  lists: Record<string, unknown[]>;
  historyLists: Record<string, unknown[]>;
  categories: Record<string, unknown[]>;
  pins: Record<string, unknown[]>;
};

export type CachedHousehold = {
  household: Household | null;
  homes: HomeSummary[];
};

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Storage is unavailable during server render.
  }
  return null;
}

function currentUserId() {
  try {
    const raw = storage()?.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as { user?: { id?: string } };
    return session.user?.id || null;
  } catch {
    return null;
  }
}

function emptySnapshot(): ProfileSnapshot {
  return {
    householdKnown: false,
    household: null,
    homes: [],
    items: {},
    lists: {},
    historyLists: {},
    categories: {},
    pins: {},
  };
}

function isHousehold(value: unknown): value is Household {
  if (!value || typeof value !== "object") return false;
  const home = value as Household;
  return typeof home.id === "string" && typeof home.name === "string";
}

function readSnapshot(userId: string): ProfileSnapshot | null {
  try {
    const raw = storage()?.getItem(`${PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfileSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      householdKnown: parsed.householdKnown === true,
      household: isHousehold(parsed.household) ? parsed.household : null,
      homes: Array.isArray(parsed.homes) ? parsed.homes : [],
      items: parsed.items && typeof parsed.items === "object" ? parsed.items : {},
      lists: parsed.lists && typeof parsed.lists === "object" ? parsed.lists : {},
      historyLists:
        parsed.historyLists && typeof parsed.historyLists === "object" ? parsed.historyLists : {},
      categories:
        parsed.categories && typeof parsed.categories === "object" ? parsed.categories : {},
      pins: parsed.pins && typeof parsed.pins === "object" ? parsed.pins : {},
    };
  } catch {
    return null;
  }
}

function writeSnapshot(userId: string, snapshot: ProfileSnapshot) {
  try {
    storage()?.setItem(`${PREFIX}${userId}`, JSON.stringify(snapshot));
  } catch {
    // Ignore quota and private-mode failures. The in-memory screen still works.
  }
}

function updateSnapshot(mutate: (snapshot: ProfileSnapshot) => void) {
  const userId = currentUserId();
  if (!userId) return;
  const snapshot = readSnapshot(userId) ?? emptySnapshot();
  mutate(snapshot);
  writeSnapshot(userId, snapshot);
}

export function readCachedHousehold(): CachedHousehold | null {
  const userId = currentUserId();
  if (!userId) return null;
  const snapshot = readSnapshot(userId);
  if (!snapshot?.householdKnown) return null;
  return { household: snapshot.household, homes: snapshot.homes };
}

export function writeCachedHousehold(household: Household | null, homes?: HomeSummary[]) {
  updateSnapshot((snapshot) => {
    snapshot.householdKnown = true;
    snapshot.household = household;
    if (!household) snapshot.homes = [];
    else if (homes) snapshot.homes = homes;
  });
}

export function writeCachedHomes(homes: HomeSummary[]) {
  updateSnapshot((snapshot) => {
    snapshot.homes = homes;
  });
}

export function readCachedItems(homeId: string): Purchase[] | null {
  const userId = currentUserId();
  const items = userId ? readSnapshot(userId)?.items[homeId] : undefined;
  return Array.isArray(items) ? items : null;
}

export function writeCachedItems(homeId: string, items: Purchase[]) {
  updateSnapshot((snapshot) => {
    snapshot.items[homeId] = items;
  });
}

export function readCachedLists<T>(homeId: string): T[] | null {
  const userId = currentUserId();
  const lists = userId ? readSnapshot(userId)?.lists[homeId] : undefined;
  return Array.isArray(lists) ? (lists as T[]) : null;
}

export function writeCachedLists(homeId: string, lists: unknown[]) {
  updateSnapshot((snapshot) => {
    snapshot.lists[homeId] = lists;
  });
}

export function readCachedHistoryLists<T>(homeId: string): T[] | null {
  const userId = currentUserId();
  const lists = userId ? readSnapshot(userId)?.historyLists[homeId] : undefined;
  return Array.isArray(lists) ? (lists as T[]) : null;
}

export function writeCachedHistoryLists(homeId: string, lists: unknown[]) {
  updateSnapshot((snapshot) => {
    snapshot.historyLists[homeId] = lists;
  });
}

export function readCachedCategories<T>(homeId: string): T[] | null {
  const userId = currentUserId();
  const categories = userId ? readSnapshot(userId)?.categories[homeId] : undefined;
  return Array.isArray(categories) ? (categories as T[]) : null;
}

export function writeCachedCategories(homeId: string, categories: unknown[]) {
  updateSnapshot((snapshot) => {
    snapshot.categories[homeId] = categories;
  });
}

export function readCachedPins<T>(homeId: string): T[] | null {
  const userId = currentUserId();
  const pins = userId ? readSnapshot(userId)?.pins[homeId] : undefined;
  return Array.isArray(pins) ? (pins as T[]) : null;
}

export function writeCachedPins(homeId: string, pins: unknown[]) {
  updateSnapshot((snapshot) => {
    snapshot.pins[homeId] = pins;
  });
}

export function clearCurrentProfileCache() {
  const userId = currentUserId();
  if (!userId) return;
  try {
    storage()?.removeItem(`${PREFIX}${userId}`);
  } catch {
    // Ignore storage failures while signing out.
  }
}
