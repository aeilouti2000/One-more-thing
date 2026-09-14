import "@/lib/session-storage";
import type { Locale } from "@/constants/i18n";

const LANGUAGE_STORAGE_KEY = "one-more-thing.language";

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

export function readStoredLocale(): Locale {
  try {
    const value = storage()?.getItem(LANGUAGE_STORAGE_KEY);
    return value === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export function writeStoredLocale(locale: Locale) {
  try {
    storage()?.setItem(LANGUAGE_STORAGE_KEY, locale);
  } catch {
    // Keep the active in-memory locale when persistence is unavailable.
  }
}
