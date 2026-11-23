import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { memo } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import type { Purchase } from "@/features/items/types/purchase";
import { formatLaterDay } from "@/features/items/utils/later-dates";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useMotionOff } from "@/providers/MotionProvider";

type LaterShelfProps = {
  /** Parked items of the list on screen, soonest to return first. */
  items: Purchase[];
  open: boolean;
  onToggle: () => void;
  /** The item being brought back right now (its button shows a spinner). */
  busyId: string | null;
  onBringBack: (id: string) => void;
};

/**
 * The Later shelf under a list: things still wanted, parked until another day.
 * Folded to one line until opened.
 */
export const LaterShelf = memo(function LaterShelf({
  items,
  open,
  onToggle,
  busyId,
  onBringBack,
}: LaterShelfProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const motionOff = useMotionOff();
  if (items.length === 0) return null;

  return (
    <Animated.View
      entering={motionOff ? undefined : FadeIn.duration(220)}
      layout={motionOff ? undefined : LinearTransition.duration(200)}
      className="mt-4 gap-2.5"
    >
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onToggle();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${t("laterSection", { count: items.length })}. ${t(
          open ? "laterHide" : "laterShow",
        )}`}
        className="flex-row items-center gap-2 px-3 py-1 active:opacity-70"
      >
        <Ionicons name="hourglass-outline" size={15} color={colors.muted} />
        <AppText className="min-w-0 flex-1 text-sm font-semibold text-cove-muted">
          {t("laterSection", { count: items.length })}
        </AppText>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
      </Pressable>

      {open
        ? items.map((item) => {
            const busy = busyId === item.id;
            const when = item.laterUntil
              ? t("laterBackOn", { date: formatLaterDay(item.laterUntil, locale) })
              : t("laterNoDate");
            return (
              <Animated.View
                key={item.id}
                entering={motionOff ? undefined : FadeIn.duration(180)}
                exiting={motionOff ? undefined : FadeOut.duration(140)}
                layout={motionOff ? undefined : LinearTransition.duration(200)}
                className="flex-row items-center gap-3 rounded-3xl bg-cove-paper py-3.5 ps-[18px] pe-3"
                style={{ opacity: 0.92 }}
              >
                <View className="min-w-0 flex-1">
                  <AppText numberOfLines={1} className="text-base font-semibold text-cove-ink">
                    {item.name}
                  </AppText>
                  <AppText numberOfLines={1} className="mt-0.5 text-sm text-cove-muted">
                    {item.unit ? `${item.quantity} ${item.unit} · ${when}` : when}
                  </AppText>
                </View>
                <Pressable
                  onPress={() => onBringBack(item.id)}
                  disabled={busyId !== null}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("laterBringBack")}, ${item.name}`}
                  accessibilityState={{ disabled: busyId !== null, busy }}
                  className="h-9 min-w-[92px] items-center justify-center rounded-full border border-cove-line px-3.5 active:opacity-80"
                  style={{ opacity: busyId !== null && !busy ? 0.5 : 1 }}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.accentText} />
                  ) : (
                    <AppText className="text-sm font-semibold text-cove-accent-text">
                      {t("laterBringBack")}
                    </AppText>
                  )}
                </Pressable>
              </Animated.View>
            );
          })
        : null}
    </Animated.View>
  );
});
