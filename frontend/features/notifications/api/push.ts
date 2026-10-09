import { isRunningInExpoGo } from "expo";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { getLocale, type Locale } from "@/constants/i18n";

const ENABLED_KEY = "omt.push.enabled";
const TOKEN_KEY = "omt.push.token";

export type PushStatus = "on" | "off" | "denied" | "unsupported";

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

export async function syncPushRegistration(locale: Locale = getLocale()): Promise<PushStatus> {
  if (!canUsePush()) return "unsupported";
  if (!readPushEnabled()) {
    await unregisterPushDevice();
    return "off";
  }

  const Notifications = await loadNotifications();
  if (!Notifications) return "unsupported";
  const Device = await import("expo-device");
  const Constants = await import("expo-constants");

  if (!Device.isDevice) return "unsupported";

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("list-updates", {
      name: "List updates",
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission =
    current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") return "denied";

  const projectId =
    Constants.default.expoConfig?.extra?.eas?.projectId ?? Constants.default.easConfig?.projectId;
  if (!projectId) return "unsupported";

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await api.post("/notifications/devices", { token, locale });
  writeStoredToken(token);
  return "on";
}

export async function unregisterPushDevice() {
  const token = readStoredToken();
  writeStoredToken(null);
  if (!token) return;
  await api.delete("/notifications/devices", { token }).catch(() => undefined);
}
