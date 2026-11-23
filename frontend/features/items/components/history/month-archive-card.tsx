import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { HomeIcon } from "@/components/ui/HomeIcon";
import type { MonthStats } from "@/features/items/api/history";
import { categoryParts, useCategoryName } from "@/features/items/components/history/category-bar";
import { HistoryNote } from "@/features/items/components/history/history-parts";
import { formatMoney } from "@/features/items/utils/currency";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * A month History no longer keeps: its purchases are cleaned, only the
 * totals saved when it was cleaned remain.
 */
export function MonthArchiveCard({
  stats,
  title,
  currency,
  costsEnabled,
  onKeepMore,
}: {
  stats: MonthStats;
  title: string;
  currency: string;
  costsEnabled: boolean;
  /** The host can choose a longer History period: a small link to it. */
  onKeepMore?: () => void;
}) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const name = useCategoryName();
  const parts = categoryParts(stats);
  const top = parts.find((part) => part.category !== "");

  return (
    <View>
      <HistoryNote icon="archive-outline" text={t("historyCleanedNote", { month: title })} />
      <View className="mb-3 rounded-3xl bg-cove-paper p-3.5">
        <AppText className="text-xs text-cove-muted">{t("historySummaryOf", { month: title })}</AppText>
        <View className="mt-2.5 flex-row gap-2">
          <Stat label={t("historyStatItems")} value={String(stats.itemCount)} />
          <Stat label={t("historyStatTrips")} value={String(stats.tripCount)} />
          {costsEnabled ? (
            <Stat label={t("historyStatTotal")} value={formatMoney(stats.spend, currency)} />
          ) : top ? (
            <Stat label={t("historyStatTop")} value={name(top.category)} />
          ) : null}
        </View>
        {costsEnabled && parts.length > 0 ? (
          <>
            <AppText className="mb-1 mt-3.5 text-xs font-semibold uppercase tracking-wider text-cove-muted">
              {t("historyByCategory")}
            </AppText>
            {parts.map((part, index) => (
              <View
                key={part.category || "trip-totals"}
                className="flex-row items-center gap-2.5 py-2"
                style={index < parts.length - 1 ? { borderBottomWidth: 1, borderBottomColor: colors.mist } : null}
              >
                <HomeIcon kind="category" id={part.category} size={32} />
                <AppText className="min-w-0 flex-1 text-sm font-semibold text-cove-ink" numberOfLines={1}>
                  {name(part.category)}
                </AppText>
                <AppText className="text-sm font-semibold text-cove-ink">{formatMoney(part.spend, currency)}</AppText>
              </View>
            ))}
          </>
        ) : null}
      </View>
      {onKeepMore ? (
        <Pressable
          onPress={onKeepMore}
          accessibilityRole="link"
          accessibilityLabel={t("historyKeepMore")}
          className="mb-3 self-center px-3 py-1.5 active:opacity-70"
        >
          <AppText className="text-sm font-semibold" style={{ color: colors.accentText }}>
            {t("historyKeepMore")}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1 rounded-xl bg-cove-ice p-2">
      <AppText className="text-[11px] text-cove-muted">{label}</AppText>
      <AppText className="mt-0.5 text-sm font-semibold text-cove-ink" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}
