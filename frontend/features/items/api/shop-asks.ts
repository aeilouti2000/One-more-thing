import { translate } from "@/constants/i18n";
import { isOnline } from "@/features/offline/network";
import { api, ApiError } from "@/lib/api";
import { formatAppError } from "@/lib/errors";

/** "nothing" = needs nothing; "done" = finished adding what they needed. */
export type ShopAskReply = "nothing" | "done";

/**
 * "Anything missing?": a shopper asks the rest of the home during a trip.
 * The same shape for the asker (who reads `replies`) and for everyone asked
 * (who read `myReply` and `myAdded`).
 */
export type ShopAsk = {
  id: string;
  homeId: string;
  listId: string;
  askedBy: string;
  askedByName: string;
  createdAt: string;
  expiresAt: string;
  mine: boolean;
  myReply: ShopAskReply | null;
  /** Items the viewer added to the list since the question. */
  myAdded: number;
  replies: { userId: string; name: string; reply: ShopAskReply | null; added: number }[];
};

/** While a question is open, the shopper's trip checks for answers this often. */
export const SHOP_ASK_POLL_MS = 15_000;

/** The notification category that carries the two answers (see push.ts). */
export const SHOP_ASK_CATEGORY = "shopAsk";
export const SHOP_ASK_ACTION_ADD = "add";
export const SHOP_ASK_ACTION_NOTHING = "nothing";

export function isOpenAsk(ask: ShopAsk, now = Date.now()) {
  const expires = new Date(ask.expiresAt).getTime();
  return Number.isFinite(expires) && expires > now;
}

export async function fetchShopAsks(homeId: string) {
  // Asked every few seconds: with no connection, answer at once.
  if (!isOnline()) return { asks: null as ShopAsk[] | null, error: translate("errorNetwork") };
  try {
    const asks = await api.get<ShopAsk[]>(`/homes/${homeId}/shop-asks`);
    return { asks, error: null as string | null };
  } catch (error) {
    return { asks: null as ShopAsk[] | null, error: formatAppError(error) };
  }
}

export async function askHome(homeId: string, listId: string) {
  try {
    const ask = await api.post<ShopAsk>(`/homes/${homeId}/lists/${listId}/shop-asks`);
    return { ask, error: null as string | null };
  } catch (error) {
    return { ask: null as ShopAsk | null, error: formatAppError(error) };
  }
}

/** The question is over (the trip ended, or its time ran out): nothing to answer. */
function isGone(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.code === "SHOP_ASK_ENDED" || error.code === "SHOP_ASK_NOT_FOUND")
  );
}

export async function replyShopAsk(askId: string, reply: ShopAskReply) {
  try {
    const ask = await api.post<ShopAsk>(`/shop-asks/${askId}/reply`, { reply });
    return { ask, gone: false, error: null as string | null };
  } catch (error) {
    return { ask: null as ShopAsk | null, gone: isGone(error), error: formatAppError(error) };
  }
}

/** An item typed straight into the notification: the server files it by its name. */
export async function addShopAskItem(askId: string, name: string) {
  try {
    await api.post(`/shop-asks/${askId}/items`, { name });
    return { gone: false, error: null as string | null };
  } catch (error) {
    return { gone: isGone(error), error: formatAppError(error) };
  }
}

/** The shopper's trip is over: stop asking. */
export async function endShopAsk(askId: string) {
  try {
    await api.delete(`/shop-asks/${askId}`);
    return { error: null as string | null };
  } catch (error) {
    return { error: formatAppError(error) };
  }
}
