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
  // The native version is what the installed APK was built as.
  return Constants.nativeAppVersion || Constants.expoConfig?.version || "0.0.0";
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

/**
 * Versions the user pressed "Later" on during this run of the app. Kept in
 * memory only, so the prompt comes back the next time the app is opened.
 */
const dismissed = new Set<string>();

export function dismissAppUpdate(version: string) {
  dismissed.add(version);
}

/** Forget "Later" so the prompt shows again, e.g. when the app is reopened. */
export function resetAppUpdateDismissal() {
  dismissed.clear();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The API runs on a host that sleeps when idle and can take close to a minute
 * to wake, so keep retrying for a while instead of giving up after one try.
 */
async function fetchRelease(patient: boolean): Promise<AppRelease | null> {
  // A check someone asked for by hand answers within one try's time.
  const deadline = Date.now() + (patient ? 90_000 : 0);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await withTimeout(api.get<AppRelease>("/app/release", false), 30_000);
    } catch {
      if (Date.now() >= deadline) return null;
      await sleep(Math.min(2000 * 2 ** attempt, 10_000));
    }
  }
}

/**
 * What Settings shows about updates. "unknown" until the server has answered
 * once; "current" when this is the newest version.
 */
export type UpdateState =
  | { status: "unknown" }
  | { status: "current" }
  | { status: "available"; version: string; downloadUrl: string };

let updateState: UpdateState = { status: "unknown" };
const updateListeners = new Set<() => void>();

export function readUpdateState() {
  return updateState;
}

export function subscribeUpdateState(listener: () => void) {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}

function setUpdateState(next: UpdateState) {
  updateState = next;
  updateListeners.forEach((listener) => listener());
}

export async function checkAppUpdate(options?: { patient?: boolean }): Promise<AppUpdate | null> {
  if (Platform.OS === "web") return null;
  const release = await fetchRelease(options?.patient !== false);
  if (!release) return null;
  const installed = installedAppVersion();
  const newer =
    release.latestVersion && release.downloadUrl && isOlderVersion(installed, release.latestVersion)
      ? { version: release.latestVersion, downloadUrl: release.downloadUrl }
      : null;
  // Settings keeps showing the update after "Later" hides the prompt.
  setUpdateState(newer ? { status: "available", ...newer } : { status: "current" });

  if (release.minVersion && isOlderVersion(installed, release.minVersion)) {
    return { required: true, version: release.minVersion, downloadUrl: release.downloadUrl };
  }
  if (newer && !dismissed.has(newer.version)) {
    return { required: false, ...newer };
  }
  return null;
}
