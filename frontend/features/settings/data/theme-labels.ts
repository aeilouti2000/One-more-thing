import type { TranslationKey } from "@/constants/i18n";
import type { ThemePreference } from "@/lib/theme-storage";

/** The name of each theme choice. */
export const THEME_LABELS: Record<ThemePreference, TranslationKey> = {
  system: "themeSystem",
  light: "light",
  dark: "dark",
  glass: "themeGlass",
};
