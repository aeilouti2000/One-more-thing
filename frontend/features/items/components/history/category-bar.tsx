import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { HomeIcon } from "@/components/ui/HomeIcon";
import { withAlpha } from "@/constants/theme";
import type { MonthStats } from "@/features/items/api/history";
import { useCategoryLabeler } from "@/features/items/providers/categories-provider";
import { formatMoney } from "@/features/items/utils/currency";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Mockup: segment widths move in 500 ms when the month changes. */
const SEGMENT_MS = 500;
const SHADES = [1, 0.7, 0.48, 0.32, 0.2, 0.13];

/** The month's categories by spend, biggest first; the trip-totals remainder ("") last. */
export function categoryParts(stats: MonthStats | null) {
  return (stats?.categories ?? [])
    .filter((row) => row.spend > 0)
    .sort((a, b) => (a.category === "" ? 1 : b.category === "" ? -1 : b.spend - a.spend));
}

export function useCategoryName() {
  const { t } = useI18n();
  const label = useCategoryLabeler();
  return (category: string) => (category === "" ? t("tripTotals") : label(category));
}

/** One bar split by category (month totals from the server), with a legend. */
export function CategoryBar({ stats, currency }: { stats: MonthStats | null; currency: string }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const name = useCategoryName();
  const parts = categoryParts(stats);
  if (parts.length === 0) return null;
  const shade = (index: number) => withAlpha(colors.accent, SHADES[Math.min(index, SHADES.length - 1)]);

  return (
    <View className="mb-3 rounded-3xl bg-cove-paper px-3.5 py-3">
      <AppText className="text-xs text-cove-muted">{t("historyByCategory")}</AppText>
      <View className="mt-2.5 h-[9px] flex-row overflow-hidden rounded-full" style={{ gap: 2 }}>
        {parts.map((part, index) => (
          <Segment key={part.category || "trip-totals"} grow={part.spend} color={shade(index)} />
        ))}
      </View>
      <View className="mt-2.5 flex-row flex-wrap" style={{ columnGap: 12, rowGap: 6 }}>
        {parts.map((part, index) => (
          <View key={part.category || "trip-totals"} className="flex-row items-center gap-1.5">
            <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: shade(index) }} />
            <HomeIcon kind="category" id={part.category} size={18} radius={6} />
            <AppText className="text-[11px] text-cove-muted">
              {name(part.category)} {formatMoney(part.spend, currency)}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}

function Segment({ grow, color }: { grow: number; color: string }) {
  const motionOff = useMotionOff();
  const flex = useSharedValue(motionOff ? grow : 0);
  useEffect(() => {
    flex.set(motionOff ? grow : withTiming(grow, { duration: SEGMENT_MS, easing: Easing.out(Easing.cubic) }));
  }, [flex, grow, motionOff]);
  const style = useAnimatedStyle(() => ({ flexGrow: flex.value }));
  return <Animated.View style={[{ flexBasis: 0, flexShrink: 1, height: "100%", backgroundColor: color }, style]} />;
}
