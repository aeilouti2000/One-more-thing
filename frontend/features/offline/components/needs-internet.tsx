import { useCallback, type ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { waitingColor } from "@/features/offline/components/sync-status-button";
import { useOnline } from "@/features/offline/network";
import { showNeedsInternet } from "@/features/offline/sync-status";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * For actions only the server can do (join or switch home, invite, ask the
 * home, account changes). `guard` runs the action when online; offline it
 * shows a short "needs internet" message instead of an error.
 */
export function useNeedsInternet() {
  const online = useOnline();
  const guard = useCallback(
    <A extends unknown[]>(action: (...args: A) => unknown) =>
      (...args: A) => {
        if (!online) {
          showNeedsInternet();
          return;
        }
        action(...args);
      },
    [online],
  );
  return { offline: !online, guard };
}

/** The small "Needs internet" tag on a card that can't be used offline. */
export function NeedsInternetTag() {
  const { scheme } = useTheme();
  const { t } = useI18n();
  const color = waitingColor(scheme);
  return (
    <View
      className="shrink-0 rounded-full px-2.5 py-1"
      style={{ backgroundColor: scheme === "dark" ? "rgba(245,176,65,0.16)" : "#FBEBD0" }}
    >
      <AppText className="text-xs font-semibold" style={{ color }}>
        {t("needsInternet")}
      </AppText>
    </View>
  );
}

/**
 * Wraps a card or row that needs the server. Offline it stays where it is,
 * dimmed and with the tag, and a tap shows the message instead of the action.
 */
export function NeedsInternet({
  children,
  style,
  tag = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** The tag sits at the end of the card; turn off where there is no room. */
  tag?: boolean;
}) {
  const { offline } = useNeedsInternet();
  if (!offline) return <View style={style}>{children}</View>;
  return (
    <Pressable
      onPress={showNeedsInternet}
      accessibilityRole="button"
      accessibilityState={{ disabled: true }}
      style={style}
    >
      <View pointerEvents="none" style={{ opacity: 0.4 }}>
        {children}
      </View>
      {tag ? (
        <View pointerEvents="none" className="absolute end-3 top-0 bottom-0 justify-center">
          <NeedsInternetTag />
        </View>
      ) : null}
    </Pressable>
  );
}
