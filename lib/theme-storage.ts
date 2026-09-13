import "@/lib/session-storage";
import type { ThemeScheme } from "@/constants/theme";

const THEME_STORAGE_KEY = "one-more-thing.theme";

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
  const value = storage()?.getItem(THEME_STORAGE_KEY);
  return value === "dark" ? "dark" : "light";
}

export function writeStoredTheme(scheme: ThemeScheme) {
  storage()?.setItem(THEME_STORAGE_KEY, scheme);
}
