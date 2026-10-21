import "@/features/auth/utils/session-storage";
import {
  DEFAULT_ACCENT,
  DEFAULT_SURFACE_DEPTH,
  normalizeHex,
  normalizeSurfaceDepth,
  type SurfaceDepth,
  type ThemeScheme,
} from "@/constants/theme";

const THEME_STORAGE_KEY = "one-more-thing.theme";
const THEME_ACCENT_STORAGE_KEY = "one-more-thing.theme-accent";
const THEME_SURFACE_DEPTH_STORAGE_KEY = "one-more-thing.theme-surface-depth";

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
    storage()?.setItem(THEME_SURFACE_DEPTH_STORAGE_KEY, normalizeSurfaceDepth(depth));
  } catch {
    // Keep the active in-memory depth when persistence is unavailable.
  }
}
