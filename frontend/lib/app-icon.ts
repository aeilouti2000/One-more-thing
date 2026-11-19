import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

/**
 * Home-screen icon choice, backed by expo-alternate-app-icons. The icons
 * themselves ("Light", "Dark") are declared in app.json and compiled into the
 * build, so only builds from 2.9.1 on have them.
 */
type AlternateIconsModule = {
  supportsAlternateIcons: boolean;
  getAppIconName(): string | null;
  setAlternateAppIcon(name: string | null): Promise<string | null>;
};

// Looked up optionally: an OTA update can reach an older build without the
// native module, and there the picker simply stays hidden.
const native = requireOptionalNativeModule<AlternateIconsModule>("ExpoAlternateAppIcons");

export type AppIconChoice = "system" | "dark" | "light";

/**
 * iOS's default icon already follows the phone's light/dark mode, so it is the
 * "system" choice there. Android has no such icon: its default is the dark one.
 */
export const APP_ICON_CHOICES: AppIconChoice[] =
  Platform.OS === "ios" ? ["system", "dark", "light"] : ["dark", "light"];

const DEFAULT_CHOICE: AppIconChoice = Platform.OS === "ios" ? "system" : "dark";

export function canChangeAppIcon(): boolean {
  return Boolean(native?.supportsAlternateIcons);
}

export function currentAppIcon(): AppIconChoice {
  let name: string | null = null;
  try {
    name = native?.getAppIconName() ?? null;
  } catch {
    // Unknown state: show the default as selected.
  }
  if (name === "Light") return "light";
  if (name === "Dark") return "dark";
  return DEFAULT_CHOICE;
}

/** Name of the alternate icon for a choice; null means the build's default icon. */
function iconName(choice: AppIconChoice): string | null {
  if (choice === DEFAULT_CHOICE) return null;
  return choice === "light" ? "Light" : "Dark";
}

export async function setAppIcon(choice: AppIconChoice): Promise<void> {
  if (!native) throw new Error("App icons are not available in this build");
  await native.setAlternateAppIcon(iconName(choice));
}
