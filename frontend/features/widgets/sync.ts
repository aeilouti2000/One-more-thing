import { loadHomeItems } from "@/features/sync/engine";
import { translate } from "@/constants/i18n";
import { fetchMyHousehold } from "@/features/homes/api/homes";
import type { Household } from "@/features/homes/types/household";
import {
  addItem,
  clearItemsLater,
  markItemBought,
} from "@/features/items/api/items";
import { fetchLists, listLabel, type HomeList } from "@/features/items/api/lists";
import { fetchPins, type Pin } from "@/features/items/api/pins";
import type { Purchase } from "@/features/items/types/purchase";
import { resolvePreferredListId } from "@/features/items/utils/list-storage";
import { emitListChanged } from "@/features/items/utils/list-sync";
// Every kind of waiting change must be known here too: this file also runs
// with no screen (the widget's background task).
import "@/features/offline/changes";
import { invoiceForBuy, planPinAdd, UNDO_WINDOW_MS } from "@/features/widgets/actions";
import { buildWidgetSnapshot } from "@/features/widgets/snapshot";
import { readWidgetStyle } from "@/features/widgets/widget-prefs";
import type { WidgetStylePrefs } from "@/features/widgets/widget-style";
import { readSession } from "@/lib/api";
import { isOfflineError, isOfflineMessage } from "@/lib/errors";
import { readStoredLocale } from "@/lib/language-storage";
import {
  readStoredAccent,
  readStoredSurfaceDepth,
  readStoredThemePreference,
  type ThemePreference,
} from "@/lib/theme-storage";
import type { Locale } from "@/constants/i18n";
import type { SurfaceDepth } from "@/constants/theme";
import {
  completeWidgetActions,
  readWidgetActions,
  setWidgetSnapshot,
  widgetsAvailable,
  type WidgetAction,
} from "@/modules/home-widgets/src";

export type WidgetLook = {
  locale: Locale;
  theme: { preference: ThemePreference; accent: string; surfaceDepth: SurfaceDepth };
  style: WidgetStylePrefs;
};

/** The language and colours as last saved: used when no screen is mounted. */
export function storedWidgetLook(): WidgetLook {
  return {
    locale: readStoredLocale(),
    theme: {
      preference: readStoredThemePreference(),
      accent: readStoredAccent(),
      surfaceDepth: readStoredSurfaceDepth(),
    },
    style: readWidgetStyle(),
  };
}

export type WidgetData = {
  user: { id: string } | null;
  household: Household | null;
  items: Purchase[];
  lists: HomeList[];
  pins: Pin[];
};

/** Hands the widgets what to show. Cheap to call often: an unchanged result redraws nothing. */
export function publishWidgets(data: WidgetData, look: WidgetLook = storedWidgetLook()) {
  if (!widgetsAvailable) return;
  const { household } = data;
  const listId = household ? resolvePreferredListId(data.lists, household.id) : null;
  const list = data.lists.find((entry) => entry.id === listId) ?? null;
  const defaultList = translate("defaultList", undefined, look.locale);
  setWidgetSnapshot(
    JSON.stringify(
      buildWidgetSnapshot({
        now: new Date(),
        locale: look.locale,
        theme: look.theme,
        style: look.style,
        user: data.user,
        household,
        items: data.items,
        list: list ? { id: list.id, title: listLabel(list.name, defaultList) } : null,
        listCount: data.lists.length,
        pins: data.pins,
      }),
    ),
  );
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

type Sent = {
  /** Taps that are dealt with: sent, or no longer possible. */
  done: string[];
  /** The server could not be reached: the rest stays for the next run. */
  retry: boolean;
};

/** What a failed request means for the tap: drop it, or keep it for later. */
function settle(action: WidgetAction, error: string | null, sent: Sent) {
  if (error && isOfflineMessage(error)) sent.retry = true;
  // Sent, or refused by the server (the item is gone, no access any more).
  else sent.done.push(action.id);
}

async function sendActions(household: Household, userId: string): Promise<Sent> {
  const sent: Sent = { done: [], retry: false };

  // A fresh tick may still be taken back with a second tap: give it a moment.
  const newestBuy = Math.max(
    0,
    ...readWidgetActions().filter((action) => action.type === "buy").map((action) => action.at),
  );
  const wait = UNDO_WINDOW_MS - (Date.now() - newestBuy);
  if (wait > 0) await sleep(Math.min(wait, UNDO_WINDOW_MS));

  const actions = readWidgetActions();
  if (actions.length === 0) return sent;

  const itemsResult = await loadHomeItems(household.id);
  if (itemsResult.error || itemsResult.offline) {
    sent.retry = true;
    return sent;
  }
  const items = itemsResult.items;
  const needsPins = actions.some((action) => action.type === "pin");
  const [listsResult, pinsResult] = needsPins
    ? await Promise.all([fetchLists(household.id), fetchPins(household.id)])
    : [null, null];

  for (const action of actions) {
    if (action.type === "buy") {
      const item = items.find((entry) => entry.id === action.target);
      // Bought or removed by someone meanwhile: nothing left to do.
      if (!item || item.status !== "needed") {
        sent.done.push(action.id);
        continue;
      }
      const receiptId = invoiceForBuy(household, items, item, new Date());
      // Sent directly, not through the waiting queue: the widget keeps its own
      // list of taps and sends them again itself.
      const result = await markItemBought(item.id, null, receiptId, { direct: true });
      settle(action, result.error, sent);
      if (!result.error) item.status = "bought";
      continue;
    }

    if (!listsResult || !pinsResult || listsResult.error || pinsResult.error) {
      sent.retry = true;
      continue;
    }
    const pin = pinsResult.pins.find((entry) => entry.id === action.target);
    if (!pin) {
      sent.done.push(action.id);
      continue;
    }
    const plan = planPinAdd(
      pin,
      items,
      listsResult.lists,
      resolvePreferredListId(listsResult.lists, household.id),
    );
    if (plan.kind === "exists") {
      sent.done.push(action.id);
    } else if (plan.kind === "restore") {
      const result = await clearItemsLater([plan.itemId], { direct: true });
      settle(action, result.error, sent);
      if (!result.error) {
        const parked = items.find((entry) => entry.id === plan.itemId);
        if (parked) parked.laterAt = undefined;
      }
    } else {
      const result = await addItem(
        {
          homeId: household.id,
          userId,
          name: pin.name,
          quantity: pin.quantity,
          category: pin.category,
          unit: pin.unit,
          urgent: pin.urgent,
          listId: plan.listId,
        },
        { direct: true },
      );
      settle(action, result.error, sent);
      // So a second pin of the same name in this run sees it is on the list.
      if (result.item) items.push(result.item);
    }
  }
  return sent;
}

/** Nobody is signed in: the widgets show that, and waiting taps are dropped. */
function publishSignedOut() {
  publishWidgets({ user: null, household: null, items: [], lists: [], pins: [] });
  return { retry: false };
}

async function runSync(): Promise<{ retry: boolean }> {
  if (!widgetsAvailable) return { retry: false };
  const session = readSession();
  if (!session) return publishSignedOut();

  let household: Household | null;
  try {
    household = await fetchMyHousehold();
  } catch (error) {
    // The session ended elsewhere (the request found that out and cleared it).
    if (!readSession()) return publishSignedOut();
    // Not known right now: the widgets keep what they show.
    return { retry: isOfflineError(error) };
  }
  // Signed out while that request was on its way.
  if (!readSession()) return publishSignedOut();
  const user = { id: session.user.id };
  if (!household) {
    publishWidgets({ user, household: null, items: [], lists: [], pins: [] });
    return { retry: false };
  }

  const sent: Sent =
    readWidgetActions().length > 0
      ? await sendActions(household, user.id)
      : { done: [], retry: false };

  const [itemsResult, listsResult, pinsResult] = await Promise.all([
    loadHomeItems(household.id),
    fetchLists(household.id),
    fetchPins(household.id),
  ]);
  const fresh = !itemsResult.error && !listsResult.error && !pinsResult.error;
  if (!readSession()) {
    publishSignedOut();
  } else if (fresh && readSession()?.user.id === user.id) {
    // The sync saved this copy, so the app opens with what the widget shows.
    publishWidgets({
      user,
      household,
      items: itemsResult.items,
      lists: listsResult.lists,
      pins: pinsResult.pins,
    });
  }
  // After the new data, so a ticked row goes straight from ticked to gone.
  completeWidgetActions(sent.done);
  // The app may be open behind the home screen: let its screens reload.
  if (sent.done.length > 0) emitListChanged();
  return { retry: sent.retry };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Sends the taps made on widgets, then gives the widgets fresh data. Runs one
 * at a time: the app and a background run share this, so a tap is never sent twice.
 */
export function syncWidgets(): Promise<{ retry: boolean }> {
  const run = queue.then(runSync, runSync);
  queue = run.catch(() => undefined);
  return run;
}
