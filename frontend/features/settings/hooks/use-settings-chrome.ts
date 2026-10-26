import { usePathname } from "expo-router";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useI18n } from "@/providers/LanguageProvider";

/** Hide stack back on top-level settings when the master pane is visible. */
export function useSettingsShowBack(options?: { nested?: boolean }) {
  const wide = useWideLayout();
  if (options?.nested) return true;
  return !wide;
}

/** Pad for the tab bar when it stays visible on wide settings detail. */
export function useSettingsTabBarInset() {
  const wide = useWideLayout();
  const pathname = usePathname();
  return wide && pathname.startsWith("/settings");
}

/**
 * Which header edge meets the other settings pane on fold.
 * Undefined on phone (and outside /settings) so headers stay unchanged.
 */
export function useSettingsSplitJoin(
  side: "master" | "detail",
): "start" | "end" | undefined {
  const wide = useWideLayout();
  const pathname = usePathname();
  const { isRTL } = useI18n();
  if (!wide || !pathname.startsWith("/settings")) return undefined;
  if (side === "master") return isRTL ? "start" : "end";
  return isRTL ? "end" : "start";
}
