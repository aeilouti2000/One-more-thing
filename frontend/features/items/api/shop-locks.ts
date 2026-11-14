import { api } from "@/lib/api";
import { formatAppError } from "@/lib/errors";

export type ShopLock = {
  listId: string;
  active: boolean;
  shopperId: string | null;
  shopperName: string | null;
  isMine: boolean;
  /** The home lets several people shop one list at the same time. */
  together?: boolean;
  /** Everyone shopping this list now (missing on an older server). */
  shoppers?: { id: string; name: string }[];
};

export const SHOP_LOCK_POLL_MS = 3000;
export const SHOP_LOCK_HEARTBEAT_MS = 15_000;
/** While someone else shops the same list, the trip checks for news this often. */
export const SHOP_TOGETHER_REFRESH_MS = 3000;

export async function fetchShopLock(homeId: string, listId: string) {
  try {
    const lock = await api.get<ShopLock>(`/homes/${homeId}/lists/${listId}/shop-lock`);
    return { lock, error: null as string | null };
  } catch (error) {
    return { lock: null as ShopLock | null, error: formatAppError(error) };
  }
}

/** newTrip: a fresh trip (clears old "not found" marks), not one resumed after the app closed. */
export async function claimShopLock(
  homeId: string,
  listId: string,
  options?: { newTrip?: boolean },
) {
  try {
    const lock = await api.post<ShopLock>(
      `/homes/${homeId}/lists/${listId}/shop-lock`,
      options?.newTrip ? { newTrip: true } : undefined,
    );
    return { lock, error: null as string | null };
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
    if (code === "LIST_SHOPPING_LOCKED") {
      const status = await fetchShopLock(homeId, listId);
      if (status.lock?.active) return { lock: status.lock, error: null };
    }
    return { lock: null as ShopLock | null, error: formatAppError(error) };
  }
}

export async function heartbeatShopLock(homeId: string, listId: string) {
  try {
    const lock = await api.post<ShopLock>(`/homes/${homeId}/lists/${listId}/shop-lock/heartbeat`);
    return { lock, error: null as string | null };
  } catch (error) {
    return { lock: null as ShopLock | null, error: formatAppError(error) };
  }
}

export async function releaseShopLock(homeId: string, listId: string) {
  try {
    await api.delete(`/homes/${homeId}/lists/${listId}/shop-lock`);
    return { error: null as string | null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}

export function firstName(fullName: string | null | undefined) {
  const trimmed = fullName?.trim() ?? "";
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}
