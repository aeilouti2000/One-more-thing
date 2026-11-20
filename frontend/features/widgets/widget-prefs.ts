import "@/features/auth/utils/session-storage";
import { setWidgetBackgroundSync } from "@/modules/home-widgets/src";

const BACKGROUND_KEY = "one-more-thing.widgets-background";

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
