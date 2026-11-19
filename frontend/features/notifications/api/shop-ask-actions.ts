import { Platform } from "react-native";
import { translate } from "@/constants/i18n";
import {
  addShopAskItem,
  replyShopAsk,
  SHOP_ASK_ACTION_ADD,
  SHOP_ASK_ACTION_NOTHING,
  SHOP_ASK_CATEGORY,
} from "@/features/items/api/shop-asks";
import { refreshShopAsksIfShown } from "@/features/items/hooks/use-shop-asks";
import { emitListChanged } from "@/features/items/utils/list-sync";
import { splitNames } from "@/features/notifications/api/shop-ask-names";

type NotificationsModule = typeof import("expo-notifications");

/** A quiet channel for "Added: Lemons": it confirms without a sound. */
export const CONFIRM_CHANNEL = "list-confirmations";

type ResponseLike = {
  actionIdentifier: string;
  userText?: string;
  notification: { request: { identifier: string; content: { data?: unknown } } };
};

type AskData = { askId: string; homeId: string | null };

function askData(response: ResponseLike): AskData | null {
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  if (data.type !== "shop_ask" || typeof data.askId !== "string") return null;
  return { askId: data.askId, homeId: typeof data.homeId === "string" ? data.homeId : null };
}

/** One of the two answer buttons on an "Anything missing?" notification. */
export function isShopAskAction(response: ResponseLike) {
  return (
    askData(response) !== null &&
    (response.actionIdentifier === SHOP_ASK_ACTION_ADD ||
      response.actionIdentifier === SHOP_ASK_ACTION_NOTHING)
  );
}

/**
 * Whether an answer button brings the app to the front.
 *
 * On iPhone the answer is sent in the background and the app stays closed. On
 * Android that only works while the app is still in memory: once the system
 * has closed it, nothing runs and the answer would be lost without a word. So
 * on Android the button opens the app, which then sends the answer. (Sending
 * it from a closed Android app needs a background task, i.e. expo-task-manager
 * and a new build.)
 */
const OPENS_APP = Platform.OS === "android";

/**
 * Puts the two answers on the notification: a text field to add an item, and
 * "Nothing, thanks". Registered again when the language changes, so the
 * buttons read in the app's language.
 */
export async function registerShopAskCategory(Notifications: NotificationsModule) {
  try {
    await Notifications.setNotificationCategoryAsync(SHOP_ASK_CATEGORY, [
      {
        identifier: SHOP_ASK_ACTION_ADD,
        buttonTitle: translate("shopAskAddItem"),
        textInput: {
          submitButtonTitle: translate("shopAskSend"),
          placeholder: translate("shopAskAddPlaceholder"),
        },
        options: { opensAppToForeground: OPENS_APP },
      },
      {
        identifier: SHOP_ASK_ACTION_NOTHING,
        buttonTitle: translate("shopAskNothing"),
        options: { opensAppToForeground: OPENS_APP },
      },
    ]);
  } catch {
    // Without the buttons the notification still opens the list when tapped.
  }
}

/** Taps already answered (the same response can arrive by two routes). */
const answered = new Set<string>();

/**
 * Answers the question straight from the notification, without opening the
 * app. Typing several items separated by commas or new lines adds each one.
 */
export async function handleShopAskAction(
  Notifications: NotificationsModule,
  response: ResponseLike,
) {
  const data = askData(response);
  if (!data) return;
  const id = response.notification.request.identifier;
  const key = `${id}:${response.actionIdentifier}:${response.userText ?? ""}`;
  if (answered.has(key)) return;
  answered.add(key);

  // Action buttons don't clear the notification by themselves.
  const dismiss = () => Notifications.dismissNotificationAsync(id).catch(() => undefined);

  if (response.actionIdentifier === SHOP_ASK_ACTION_NOTHING) {
    const result = await replyShopAsk(data.askId, "nothing");
    // Ended meanwhile counts as answered.
    if (!result.error || result.gone) await dismiss();
    else {
      // Not sent (offline, a sleeping server): say so, and let a second tap try again.
      answered.delete(key);
      await notify(Notifications, translate("shopAskReplyFailedNotice"));
    }
  } else {
    const names = splitNames(response.userText ?? "");
    // An empty reply: nothing to add, but the notification must stop waiting.
    if (names.length === 0) {
      answered.delete(key);
      await dismiss();
      return;
    }
    const added: string[] = [];
    const failed: string[] = [];
    for (const name of names) {
      const result = await addShopAskItem(data.askId, name);
      if (result.error) failed.push(name);
      else added.push(name);
    }
    await dismiss();
    await notify(
      Notifications,
      failed.length > 0
        ? translate("shopAskFailedNotice", { name: failed.join(", ") })
        : translate("shopAskAddedNotice", { name: added.join(", ") }),
    );
  }

  emitListChanged();
  if (data.homeId) refreshShopAsksIfShown(data.homeId);
}

/** A quiet note in place of the question, so the answer is seen to have landed (or not). */
async function notify(Notifications: NotificationsModule, body: string) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: translate("appName"), body, sound: false },
      trigger: { channelId: CONFIRM_CHANNEL },
    });
  } catch {
    // The answer itself is not affected.
  }
}
