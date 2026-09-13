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
  const value = storage()?.getItem(LANGUAGE_STORAGE_KEY);
  return value === "ar" ? "ar" : "en";
}

export function writeStoredLocale(locale: Locale) {
  storage()?.setItem(LANGUAGE_STORAGE_KEY, locale);
}
