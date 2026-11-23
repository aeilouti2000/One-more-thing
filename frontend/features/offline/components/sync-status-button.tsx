import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, { ZoomIn, ZoomOut } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { headerActionStyle, iconSize } from "@/constants/theme";
import { openSyncSheet, useSyncStatus } from "@/features/offline/sync-status";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** The amber of "waiting", readable on a white chip and on a dark one. */
export function waitingColor(scheme: "light" | "dark") {
  return scheme === "dark" ? "#F5B041" : "#B26A00";
}

/**
 * The cloud in a screen's header. Not there at all while everything is saved;
 * with no internet it appears with the number of changes waiting, spins while
 * they are sent, and shows a tick for a moment when all are saved. Tapping it
 * opens the list of what is waiting.
 */
export function SyncStatusButton() {
  const { state, count } = useSyncStatus();
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const motionOff = useMotionOff();
  if (state === "hidden") return null;

  const chip = headerActionStyle(scheme, colors);
  const amber = waitingColor(scheme);
  const label =
    state === "offline"
      ? count > 0
        ? t("syncButtonWaiting", { count })
        : t("syncOfflineTitle")
      : state === "syncing"
        ? t("syncSendingTitle")
        : t("syncAllSaved");

  return (
    <Animated.View
      entering={motionOff ? undefined : ZoomIn.duration(200)}
      exiting={motionOff ? undefined : ZoomOut.duration(160)}
    >
      <Pressable
        onPress={openSyncSheet}
        accessibilityRole="button"
        accessibilityLabel={label}
        hitSlop={6}
        className="h-10 w-10 items-center justify-center rounded-full active:opacity-80"
        style={{ backgroundColor: scheme === "dark" ? colors.mist : chip.backgroundColor }}
      >
        {state === "syncing" ? (
          <ActivityIndicator size="small" color={scheme === "dark" ? colors.ink : chip.color} />
        ) : (
          <Ionicons
            name={state === "offline" ? "cloud-offline-outline" : "checkmark-circle-outline"}
            size={iconSize.sm}
            color={state === "offline" ? amber : scheme === "dark" ? colors.ink : chip.color}
          />
        )}
        {count > 0 ? (
          <View
            pointerEvents="none"
            className="absolute -end-1 -top-1 h-[18px] min-w-[18px] items-center justify-center rounded-full px-1"
            style={{ backgroundColor: amber }}
          >
            <AppText
              className="text-[11px] font-bold"
              style={{ color: scheme === "dark" ? "#1A1206" : "#FFFFFF", lineHeight: 14 }}
            >
              {count > 99 ? "99+" : count}
            </AppText>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
