import { previousMonth } from "@/features/items/utils/insights";
import { useOlderMonths, withOlderMonths } from "@/features/sync/month-purchases";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { monthLabel } from "@/features/items/components/recap-screen";
import { useHousehold } from "@/features/homes/hooks/use-household";
import type { Purchase } from "@/features/items/types/purchase";
import { formatMoney } from "@/features/items/utils/currency";
import { recapMonthToOffer, summarizeRecap } from "@/features/items/utils/recap";
import { dismissRecap, recapDismissed } from "@/features/items/utils/recap-storage";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useMotionOff } from "@/providers/MotionProvider";

/**
 * "Your October recap is ready": offered at the top of History for the first
 * week of a month, until it is opened and closed, or the home turns it off.
 */
export function RecapCard({ purchases, now }: { purchases: Purchase[]; now: number }) {
  const { household } = useHousehold();
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const motionOff = useMotionOff();
  const homeId = household?.id ?? null;
  const month = household?.monthlyRecap === false ? null : recapMonthToOffer(new Date(now));
  // Closing it is remembered on the phone; this only hides it right away.
  const [closed, setClosed] = useState<string | null>(null);
  const key = homeId && month ? `${homeId}:${month}` : null;
  const hidden = !key || closed === key || recapDismissed(homeId as string, month as string);

  // The month before the recap's month may be older than the phone keeps: loaded once.
  const older = useOlderMonths(hidden ? null : homeId, month ? [month, previousMonth(month)] : []);
  const recap = useMemo(
    () => (hidden || !month ? null : summarizeRecap(withOlderMonths(purchases, older), month)),
    [hidden, month, older, purchases],
  );
  if (!recap || !month || !homeId || recap.items === 0) return null;

  const costs = household?.costsEnabled === true && recap.priced;
  const name = monthLabel(month, locale);

  return (
    <Animated.View
      entering={motionOff ? undefined : FadeIn.duration(220)}
      exiting={motionOff ? undefined : FadeOut.duration(160)}
      layout={motionOff ? undefined : LinearTransition.duration(200)}
      className="mb-3 flex-row items-center gap-3 rounded-3xl bg-cove-mist py-3 ps-4 pe-2"
    >
      <Pressable
        onPress={() => router.push({ pathname: "/recap", params: { month } })}
        accessibilityRole="button"
        accessibilityLabel={`${t("recapCardTitle", { month: name })}. ${t("recapSee")}`}
        className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
      >
        <View className="min-w-0 flex-1">
          <AppText numberOfLines={2} className="text-base font-semibold text-cove-ink">
            {t("recapCardTitle", { month: name })}
          </AppText>
          <AppText numberOfLines={1} className="mt-0.5 text-sm text-cove-muted">
            {costs
              ? t("recapCardSpent", {
                  trips: recap.trips,
                  total: formatMoney(recap.total, household?.currency),
                })
              : t("recapCardCounts", { trips: recap.trips, items: recap.items })}
          </AppText>
        </View>
        <View className="rounded-full bg-cove-accent px-3.5 py-2">
          <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
            {t("recapSee")}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        onPress={() => {
          dismissRecap(homeId, month);
          setClosed(key);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t("recapDismiss")}
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
      >
        <Ionicons name="close" size={18} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}
