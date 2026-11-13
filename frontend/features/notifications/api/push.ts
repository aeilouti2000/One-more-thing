import { isRunningInExpoGo } from "expo";
import { Alert, Platform } from "react-native";
import "@/features/auth/utils/session-storage";
import { api } from "@/lib/api";
import { getLocale, translate, type Locale } from "@/constants/i18n";

const ENABLED_KEY = "omt.push.enabled";
const TOKEN_KEY = "omt.push.token";
const ASKED_KEY = "omt.push.asked";

/**
 * on: this phone gets list notifications.
 * off: the user turned them off in the app.
 * ask: the phone has not asked for permission yet (we wait for a good moment).
 * denied: blocked in the phone's settings.
 * error: registration failed (offline, push service down); retried later.
 */
export type PushStatus = "on" | "off" | "ask" | "denied" | "error" | "unsupported";

export type PermissionState = "granted" | "denied" | "undetermined" | "unsupported";

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Native and server renders can hide localStorage.
  }
  return null;
}

export function readPushEnabled() {
  return storage()?.getItem(ENABLED_KEY) !== "0";
}

/** Remote push was removed from Expo Go on Android in SDK 53. Importing it throws and closes the app. */
export function canUsePush() {
  if (Platform.OS === "web") return false;
  if (Platform.OS === "android" && isRunningInExpoGo()) return false;
  return true;
}

export async function loadNotifications() {
  if (!canUsePush()) return null;
  try {
    const Notifications = await import("expo-notifications");
    if (typeof Notifications.setNotificationHandler !== "function") return null;
    return Notifications;
  } catch {
    return null;
  }
}

export function writePushEnabled(enabled: boolean) {
  storage()?.setItem(ENABLED_KEY, enabled ? "1" : "0");
}

function readStoredToken() {
  return storage()?.getItem(TOKEN_KEY) ?? null;
}

function writeStoredToken(token: string | null) {
  if (token) storage()?.setItem(TOKEN_KEY, token);
  else storage()?.removeItem(TOKEN_KEY);
}

/** The phone's notification permission, without asking. */
export async function readNotificationPermission(): Promise<PermissionState> {
  const Notifications = await loadNotifications();
  if (!Notifications) return "unsupported";
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return "granted";
    if (current.status === "denied" && !current.canAskAgain) return "denied";
    return current.canAskAgain === false ? "denied" : "undetermined";
  } catch {
    return "unsupported";
  }
}

/** Shows the phone's own permission prompt (when it still can). */
export async function requestNotificationPermission(): Promise<PermissionState> {
  const Notifications = await loadNotifications();
  if (!Notifications) return "unsupported";
  try {
    const result = await Notifications.requestPermissionsAsync();
    storage()?.setItem(ASKED_KEY, "1");
    if (result.status === "granted") return "granted";
    return result.canAskAgain ? "undetermined" : "denied";
  } catch {
    return "unsupported";
  }
}

/**
 * Registers this phone for list notifications when allowed.
 * `prompt: true` may show the phone's permission prompt; only pass it after
 * the user asked for notifications (a toggle, the Permissions page, a soft ask).
 */
export async function syncPushRegistration(
  locale: Locale = getLocale(),
  options: { prompt?: boolean } = {},
): Promise<PushStatus> {
  if (!canUsePush()) return "unsupported";
  if (!readPushEnabled()) {
    await unregisterPushDevice();
    return "off";
  }

  try {
    const Notifications = await loadNotifications();
    if (!Notifications) return "unsupported";
    const Device = await import("expo-device");
    const Constants = await import("expo-constants");

    if (!Device.isDevice) return "unsupported";

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("list-updates", {
        name: translate("listAlerts", undefined, locale),
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    let permission = await readNotificationPermission();
    if (permission === "undetermined" && options.prompt) {
      permission = await requestNotificationPermission();
    }
    if (permission === "denied") return "denied";
    if (permission !== "granted") return permission === "unsupported" ? "unsupported" : "ask";

    const projectId =
      Constants.default.expoConfig?.extra?.eas?.projectId ?? Constants.default.easConfig?.projectId;
    if (!projectId) return "unsupported";

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const previous = readStoredToken();
    await api.post("/notifications/devices", {
      token,
      locale,
      ...(previous && previous !== token ? { previousToken: previous } : {}),
    });
    writeStoredToken(token);
    return "on";
  } catch {
    return "error";
  }
}

export async function unregisterPushDevice() {
  const token = readStoredToken();
  writeStoredToken(null);
  if (!token) return;
  await api.delete("/notifications/devices", { token }).catch(() => undefined);
}

let asking = false;

/**
 * A one-time, friendly ask at a moment where alerts make sense (the household
 * has other people, or you just joined one). The phone's own prompt only
 * appears if the user says yes here, so a "no" doesn't block it for good.
 */
export async function maybeAskForPush(locale: Locale = getLocale()) {
  if (asking || !canUsePush() || !readPushEnabled()) return;
  if (storage()?.getItem(ASKED_KEY) === "1") return;
  if ((await readNotificationPermission()) !== "undetermined") return;

  asking = true;
  storage()?.setItem(ASKED_KEY, "1");
  Alert.alert(
    translate("pushAskTitle", undefined, locale),
    translate("pushAskBody", undefined, locale),
    [
      { text: translate("notNow", undefined, locale), style: "cancel", onPress: () => (asking = false) },
      {
        text: translate("turnOnAlerts", undefined, locale),
        onPress: () => {
          void syncPushRegistration(locale, { prompt: true }).finally(() => (asking = false));
        },
      },
    ],
    { cancelable: true, onDismiss: () => (asking = false) },
  );
}
