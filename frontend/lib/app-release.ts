import Constants from "expo-constants";
import { Platform } from "react-native";
import { api } from "@/lib/api";

type AppRelease = {
  minVersion: string | null;
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

export async function requiredAppUpdate() {
  if (Platform.OS === "web") return null;
  try {
    const release = await api.get<AppRelease>("/app/release", false);
    if (!release.minVersion) return null;
    if (!isOlderVersion(installedAppVersion(), release.minVersion)) return null;
    return { downloadUrl: release.downloadUrl };
  } catch {
    return null;
  }
}
