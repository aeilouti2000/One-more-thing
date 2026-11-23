import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { AppText } from "@/components/ui/AppText";
import { cardLift } from "@/constants/theme";
import { formatMoney } from "@/features/items/utils/currency";
import { COUNT_UP_MS, useCountUp } from "@/features/items/components/history/history-parts";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING = 78;
const STROKE = 8.5;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The top of the Purchases page: the month with its arrows, the month's
 * total from the server (counts up), item count, export and search buttons,
 * and a ring of spend over budget (only when the home has a budget).
 */
export function MonthHero({
  title,
  total,
  itemCount,
  budget,
  currency,
  costsEnabled,
  archived,
  canOlder,
  canNewer,
  onOlder,
  onNewer,
  exporting,
  onExport,
  searching,
  onSearch,
}: {
  title: string;
  /** null while the month's totals are not loaded. */
  total: number | null;
  itemCount: number | null;
  budget: number | null;
  currency: string;
  costsEnabled: boolean;
  archived: boolean;
  canOlder: boolean;
  canNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
  exporting: boolean;
  onExport?: () => void;
  searching: boolean;
  onSearch: () => void;
}) {
  const { t, isRTL } = useI18n();
  const { colors, glass, scheme } = useTheme();
  const shownTotal = useCountUp(total ?? 0);
  const showRing = costsEnabled && budget !== null && budget > 0;
  const used = showRing && total !== null ? Math.min(100, Math.round((total / (budget as number)) * 100)) : 0;
  const subtitle =
    itemCount === null
      ? " "
      : [
          showRing && !archived ? t("historyOfBudget", { budget: formatMoney(budget, currency) }) : null,
          t("historyItemCount", { count: itemCount }),
          archived ? t("historySummaryOnly") : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <View
      className="mb-3 flex-row items-center gap-3 rounded-3xl bg-cove-paper p-3"
      style={{
        shadowColor: scheme === "dark" ? "#000000" : colors.ink,
        shadowOpacity: scheme === "dark" ? 0.22 : 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        ...cardLift(glass, 1),
      }}
    >
      {showRing ? <SpendRing percent={archived ? 0 : used} label={archived ? "—" : `${used}%`} /> : null}
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <RoundButton
              icon={isRTL ? "chevron-forward" : "chevron-back"}
              label={t("historyOlderMonth")}
              disabled={!canOlder}
              onPress={onOlder}
            />
            <AppText className="min-w-[86px] text-center text-sm font-semibold text-cove-ink" numberOfLines={1}>
              {title}
            </AppText>
            <RoundButton
              icon={isRTL ? "chevron-back" : "chevron-forward"}
              label={t("historyNewerMonth")}
              disabled={!canNewer}
              onPress={onNewer}
            />
          </View>
          <View className="flex-row items-center">
            {onExport ? (
              exporting ? (
                <View className="h-8 w-8 items-center justify-center">
                  <ActivityIndicator size="small" color={colors.accentText} />
                </View>
              ) : (
                <RoundButton icon="share-outline" label={t("exportTitle")} onPress={onExport} />
              )
            ) : null}
            <RoundButton
              icon={searching ? "close" : "search"}
              label={searching ? t("closeSearch") : t("searchHistory")}
              onPress={onSearch}
            />
          </View>
        </View>
        {costsEnabled ? (
          <AppText
            className="mt-0.5 text-[27px] font-bold tracking-tight text-cove-ink"
            style={{ fontVariant: ["tabular-nums"] }}
            numberOfLines={1}
          >
            {total === null ? " " : formatMoney(shownTotal, currency)}
          </AppText>
        ) : null}
        <AppText className="text-xs text-cove-muted" numberOfLines={1}>
          {subtitle}
        </AppText>
      </View>
    </View>
  );
}

function RoundButton({
  icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-8 w-8 items-center justify-center rounded-full active:bg-cove-mist"
      style={{ opacity: disabled ? 0.3 : 1 }}
    >
      <Ionicons name={icon} size={17} color={colors.accentText} />
    </Pressable>
  );
}

/** Spend over budget; sweeps to the new value in 600 ms when the month changes. */
function SpendRing({ percent, label }: { percent: number; label: string }) {
  const { colors } = useTheme();
  const motionOff = useMotionOff();
  const progress = useSharedValue(motionOff ? percent : 0);
  useEffect(() => {
    progress.set(
      motionOff
        ? percent
        : withTiming(percent, { duration: COUNT_UP_MS, easing: Easing.out(Easing.cubic) }),
    );
  }, [motionOff, percent, progress]);
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: CIRCUMFERENCE * (1 - progress.value / 100),
  }));

  return (
    <View style={{ width: RING, height: RING }} className="items-center justify-center">
      <Svg width={RING} height={RING} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={colors.mist} strokeWidth={STROKE} fill="none" />
        <AnimatedCircle
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          stroke={colors.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          animatedProps={arc}
        />
      </Svg>
      <AppText className="text-[13px] font-bold text-cove-ink">{label}</AppText>
    </View>
  );
}
