import "@/features/auth/utils/session-storage";
import { fontScales, type FontScaleLevel } from "@/constants/font";

const FONT_SCALE_STORAGE_KEY = "one-more-thing.font-scale";

function storage() {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // SSR and some native runtimes do not expose localStorage.
  }
  return null;
}

export function readStoredFontScale(): FontScaleLevel {
  try {
    const value = storage()?.getItem(FONT_SCALE_STORAGE_KEY);
    if (value != null && value in fontScales) return value as FontScaleLevel;
    return "medium";
  } catch {
    return "medium";
  }
}

export function writeStoredFontScale(level: FontScaleLevel) {
  try {
    storage()?.setItem(FONT_SCALE_STORAGE_KEY, level);
  } catch {
    // Keep the active in-memory size when persistence is unavailable.
  }
}
