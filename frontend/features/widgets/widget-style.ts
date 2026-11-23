/**
 * How the home screen widgets are drawn: the choices on the Widgets page.
 * Plain values only, so the snapshot builder and its tests can use them
 * without loading storage or native code (see widget-prefs.ts for those).
 */

/** "theme": the app's own light or dark colours. "glass": see-through. */
export const WIDGET_STYLES = ["theme", "glass"] as const;
export type WidgetStyle = (typeof WIDGET_STYLES)[number];

/** Glass widgets: light, dark, or whichever the phone is in ("auto"). */
export const WIDGET_GLASS_TINTS = ["auto", "light", "dark"] as const;
export type WidgetGlassTint = (typeof WIDGET_GLASS_TINTS)[number];

/** How many steps the "See-through" setting has; 0 is the most solid. */
export const WIDGET_GLASS_CLARITY_STEPS = 5;

export type WidgetStylePrefs = {
  style: WidgetStyle;
  tint: WidgetGlassTint;
  /** 0 to WIDGET_GLASS_CLARITY_STEPS - 1. */
  clarity: number;
};

export const DEFAULT_WIDGET_STYLE: WidgetStylePrefs = { style: "theme", tint: "auto", clarity: 2 };
