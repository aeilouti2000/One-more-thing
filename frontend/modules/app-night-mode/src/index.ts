import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type AppNightModeNative = {
  setNightMode(mode: "light" | "dark" | "system"): void;
};

// Missing on web, iOS and APKs built before this module existed.
const native: AppNightModeNative | null =
  Platform.OS === "android" ? requireOptionalNativeModule<AppNightModeNative>("AppNightMode") : null;

/** So the next launch's system splash uses the app's theme, not just the phone's. */
export function setAppNightMode(mode: "light" | "dark" | "system") {
  try {
    native?.setNightMode(mode);
  } catch {
    // Only the next launch's splash colour depends on this.
  }
}
