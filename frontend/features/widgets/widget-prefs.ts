import "@/features/auth/utils/session-storage";
import {
  DEFAULT_WIDGET_STYLE,
  WIDGET_GLASS_CLARITY_STEPS,
  WIDGET_GLASS_TINTS,
  WIDGET_STYLES,
  type WidgetStylePrefs,
} from "@/features/widgets/widget-style";
import { setWidgetBackgroundSync, widgetGlassAvailable } from "@/modules/home-widgets/src";

const BACKGROUND_KEY = "one-more-thing.widgets-background";
const STYLE_KEY = "one-more-thing.widgets-style";

const styleListeners = new Set<() => void>();
/** The parsed value of the last text read, so the same text gives the same object. */
let styleCache: { raw: string | null; prefs: WidgetStylePrefs } | null = null;

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // SSR and some native runtimes do not expose localStorage.
  }
  return null;
}

/** On unless turned off: widgets fetch newer data while the app is closed. */
export function readWidgetBackground() {
  try {
    return storage()?.getItem(BACKGROUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeWidgetBackground(enabled: boolean) {
  try {
    storage()?.setItem(BACKGROUND_KEY, enabled ? "on" : "off");
  } catch {
    // The native side still gets the choice below.
  }
  setWidgetBackgroundSync(enabled);
}

function parseStyle(raw: string | null): WidgetStylePrefs {
  if (!raw) return DEFAULT_WIDGET_STYLE;
  try {
    const saved = JSON.parse(raw) as Partial<WidgetStylePrefs>;
    const clarity = Number(saved.clarity);
    return {
      style: WIDGET_STYLES.find((style) => style === saved.style) ?? DEFAULT_WIDGET_STYLE.style,
      tint: WIDGET_GLASS_TINTS.find((tint) => tint === saved.tint) ?? DEFAULT_WIDGET_STYLE.tint,
      clarity: Number.isInteger(clarity)
        ? Math.min(WIDGET_GLASS_CLARITY_STEPS - 1, Math.max(0, clarity))
        : DEFAULT_WIDGET_STYLE.clarity,
    };
  } catch {
    return DEFAULT_WIDGET_STYLE;
  }
}

/**
 * How the widgets are drawn. Always "theme" on an app build whose widgets
 * cannot draw glass, whatever was saved. The same object until it changes, so
 * it can be read with useSyncExternalStore.
 */
export function readWidgetStyle(): WidgetStylePrefs {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(STYLE_KEY) ?? null;
  } catch {
    // Falls back to the default below.
  }
  if (!styleCache || styleCache.raw !== raw) {
    const saved = parseStyle(raw);
    styleCache = { raw, prefs: widgetGlassAvailable ? saved : { ...saved, style: "theme" } };
  }
  return styleCache.prefs;
}

export function writeWidgetStyle(next: WidgetStylePrefs) {
  try {
    storage()?.setItem(STYLE_KEY, JSON.stringify(next));
  } catch {
    // Nothing to redraw: the saved choice did not change.
    return;
  }
  for (const listener of styleListeners) listener();
}

export function subscribeWidgetStyle(listener: () => void) {
  styleListeners.add(listener);
  return () => {
    styleListeners.delete(listener);
  };
}
