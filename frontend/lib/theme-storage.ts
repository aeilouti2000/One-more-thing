import "@/lib/session-storage";
import { DEFAULT_ACCENT, normalizeHex, type ThemeScheme } from "@/constants/theme";

const THEME_STORAGE_KEY = "one-more-thing.theme";
const THEME_ACCENT_STORAGE_KEY = "one-more-thing.theme-accent";

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

export function readStoredTheme(): ThemeScheme {
  try {
    const value = storage()?.getItem(THEME_STORAGE_KEY);
    if (value === "light") return "light";
    if (value === "dark") return "dark";
    return "dark";
  } catch {
    return "dark";
  }
}

export function writeStoredTheme(scheme: ThemeScheme) {
  try {
    storage()?.setItem(THEME_STORAGE_KEY, scheme);
  } catch {
    // Keep the active in-memory theme when persistence is unavailable.
  }
}

export function readStoredAccent(): string {
  try {
    const value = storage()?.getItem(THEME_ACCENT_STORAGE_KEY);
    return normalizeHex(value) ?? DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function writeStoredAccent(accent: string) {
  try {
    const next = normalizeHex(accent) ?? DEFAULT_ACCENT;
    storage()?.setItem(THEME_ACCENT_STORAGE_KEY, next);
  } catch {
    // Keep the active in-memory accent when persistence is unavailable.
  }
}
