import "@/features/auth/utils/session-storage";
import {
  DEFAULT_ACCENT,
  DEFAULT_GLASS_FROST,
  DEFAULT_SURFACE_DEPTH,
  normalizeGlassFrost,
  normalizeHex,
  normalizeSurfaceDepth,
  type GlassFrost,
  type SurfaceDepth,
  type ThemeScheme,
} from "@/constants/theme";

/**
 * The user's own choice: "system" (follow the phone) until they pick light,
 * dark or glass. A new key on purpose — the old one was written on every launch, so it
 * can't tell a real choice from the old dark default.
 */
const THEME_PREFERENCE_KEY = "one-more-thing.theme-preference";
const THEME_ACCENT_STORAGE_KEY = "one-more-thing.theme-accent";
const THEME_SURFACE_DEPTH_STORAGE_KEY = "one-more-thing.theme-surface-depth";
const THEME_GLASS_FROST_STORAGE_KEY = "one-more-thing.theme-glass-frost";

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

/** "glass" is a third look, drawn on the dark scheme. */
export type ThemePreference = ThemeScheme | "system" | "glass";

export function readStoredThemePreference(): ThemePreference {
  try {
    const value = storage()?.getItem(THEME_PREFERENCE_KEY);
    if (value === "light" || value === "dark" || value === "glass") return value;
    return "system";
  } catch {
    return "system";
  }
}

export function writeStoredThemePreference(preference: ThemePreference) {
  try {
    storage()?.setItem(THEME_PREFERENCE_KEY, preference);
  } catch {
    // Keep the active in-memory preference when persistence is unavailable.
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

export function readStoredSurfaceDepth(): SurfaceDepth {
  try {
    const value = storage()?.getItem(THEME_SURFACE_DEPTH_STORAGE_KEY);
    return normalizeSurfaceDepth(value);
  } catch {
    return DEFAULT_SURFACE_DEPTH;
  }
}

export function writeStoredSurfaceDepth(depth: SurfaceDepth) {
  try {
    storage()?.setItem(
      THEME_SURFACE_DEPTH_STORAGE_KEY,
      normalizeSurfaceDepth(depth),
    );
  } catch {
    // Keep the active in-memory depth when persistence is unavailable.
  }
}

export function readStoredGlassFrost(): GlassFrost {
  try {
    return normalizeGlassFrost(storage()?.getItem(THEME_GLASS_FROST_STORAGE_KEY));
  } catch {
    return DEFAULT_GLASS_FROST;
  }
}

export function writeStoredGlassFrost(frost: GlassFrost) {
  try {
    storage()?.setItem(THEME_GLASS_FROST_STORAGE_KEY, normalizeGlassFrost(frost));
  } catch {
    // Keep the active in-memory level when persistence is unavailable.
  }
}
