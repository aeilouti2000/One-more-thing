import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

export type WidgetKind = "list" | "budget" | "pins" | "pulse";

/** A tap made on a widget that has not been sent to the server yet. */
export type WidgetAction = {
  id: string;
  /** "buy": a list item was ticked. "pin": a pinned item was tapped. */
  type: "buy" | "pin";
  /** The item's id, or the pin's id. */
  target: string;
  /** When it was tapped (ms). */
  at: number;
};

/** How many of each widget are on the home screen. */
export type WidgetStatus = Record<WidgetKind, number> & {
  /** The phone can show its "add this widget?" prompt from inside the app. */
  canPin: boolean;
};

type HomeWidgetsNative = {
  /** True on builds whose widgets can draw the glass style. Missing on older ones. */
  supportsGlass?: boolean;
  setSnapshot(json: string): void;
  getPendingActions(): string;
  completeActions(ids: string[]): void;
  finishSync(reason: string, retry: boolean): void;
  setBackgroundSync(enabled: boolean): void;
  getStatus(): WidgetStatus;
  requestPin(kind: string): boolean;
};

// Missing on web, iOS and APKs built before this module existed.
const native: HomeWidgetsNative | null =
  Platform.OS === "android"
    ? requireOptionalNativeModule<HomeWidgetsNative>("HomeWidgets")
    : null;

/** False where there are no widgets: everything below then does nothing. */
export const widgetsAvailable = native !== null;

/**
 * The installed app can draw see-through widgets. False on a build from
 * before that existed: those paint every colour solid.
 */
export const widgetGlassAvailable = native?.supportsGlass === true;

/** Hands the widgets what to show. They redraw only when it changed. */
export function setWidgetSnapshot(json: string) {
  try {
    native?.setSnapshot(json);
  } catch {
    // The widgets keep what they had.
  }
}

export function readWidgetActions(): WidgetAction[] {
  try {
    const raw = native?.getPendingActions();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is WidgetAction =>
        typeof row === "object" &&
        row !== null &&
        typeof (row as WidgetAction).id === "string" &&
        typeof (row as WidgetAction).target === "string" &&
        ((row as WidgetAction).type === "buy" || (row as WidgetAction).type === "pin"),
    );
  } catch {
    return [];
  }
}

/** These taps are dealt with: sent, or no longer possible. */
export function completeWidgetActions(ids: string[]) {
  if (ids.length === 0) return;
  try {
    native?.completeActions(ids);
  } catch {
    // They are tried again on the next run; sending twice is harmless.
  }
}

/** Ends a background run. retry: the server could not be reached. */
export function finishWidgetSync(reason: string, retry: boolean) {
  try {
    native?.finishSync(reason, retry);
  } catch {
    // Android ends the run by itself after a while.
  }
}

export function setWidgetBackgroundSync(enabled: boolean) {
  try {
    native?.setBackgroundSync(enabled);
  } catch {
    // Keeps the previous choice.
  }
}

export function readWidgetStatus(): WidgetStatus | null {
  try {
    return native?.getStatus() ?? null;
  } catch {
    return null;
  }
}

/** How many widgets of any kind are on the home screen. */
export function widgetCount(status: WidgetStatus | null) {
  if (!status) return 0;
  return status.list + status.budget + status.pins + status.pulse;
}

/** Shows the phone's "add to home screen?" prompt. False when it can't. */
export function requestWidgetPin(kind: WidgetKind) {
  try {
    return native?.requestPin(kind) === true;
  } catch {
    return false;
  }
}
