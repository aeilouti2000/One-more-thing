import "@/features/auth/utils/session-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { withTimeout } from "@/lib/with-timeout";

type AppRelease = {
  minVersion: string | null;
  latestVersion?: string | null;
  downloadUrl: string | null;
};

export function installedAppVersion() {
  return Constants.expoConfig?.version || Constants.nativeAppVersion || "0.0.0";
}

export function isOlderVersion(installed: string, required: string) {
  const left = installed.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = required.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const current = left[index] ?? 0;
    const minimum = right[index] ?? 0;
    if (current < minimum) return true;
    if (current > minimum) return false;
  }
  return false;
}

export type AppUpdate = {
  /** True when the installed version is below the minimum: the user cannot skip it. */
  required: boolean;
  version: string;
  downloadUrl: string | null;
};

const DISMISS_KEY = "omt.updateDismissed";
/** After "Later", the optional prompt stays hidden this long for the same version. */
const DISMISS_FOR_MS = 3 * 24 * 60 * 60 * 1000;

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // Storage unavailable.
  }
  return null;
}

function recentlyDismissed(version: string) {
  try {
    const raw = storage()?.getItem(DISMISS_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { version?: string; at?: number };
    return saved.version === version && typeof saved.at === "number" && Date.now() - saved.at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

export function dismissAppUpdate(version: string) {
  try {
    storage()?.setItem(DISMISS_KEY, JSON.stringify({ version, at: Date.now() }));
  } catch {
    // Ignore: the prompt will simply show again next launch.
  }
}

export async function checkAppUpdate(): Promise<AppUpdate | null> {
  if (Platform.OS === "web") return null;
  try {
    const release = await withTimeout(api.get<AppRelease>("/app/release", false), 2500);
    const installed = installedAppVersion();
    if (release.minVersion && isOlderVersion(installed, release.minVersion)) {
      return { required: true, version: release.minVersion, downloadUrl: release.downloadUrl };
    }
    if (
      release.latestVersion &&
      release.downloadUrl &&
      isOlderVersion(installed, release.latestVersion) &&
      !recentlyDismissed(release.latestVersion)
    ) {
      return { required: false, version: release.latestVersion, downloadUrl: release.downloadUrl };
    }
    return null;
  } catch {
    return null;
  }
}
