import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { withAlpha } from "@/constants/theme";
import { useCategoryLabeler } from "@/features/items/providers/categories-provider";
import type { Purchase } from "@/features/items/types/purchase";
import { formatMoney } from "@/features/items/utils/currency";
import {
  currentMonth,
  previousMonth,
  summarizeMonth,
  TRIP_TOTALS,
} from "@/features/items/utils/insights";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const CATEGORIES_SHOWN = 4;
const WARN_AT = 0.8;

function Bar({ fraction, color, track }: { fraction: number; color: string; track: string }) {
  const width = `${Math.round(Math.min(Math.max(fraction, 0), 1) * 100)}%` as `${number}%`;
  return (
    <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: track }}>
      <View className="h-2 rounded-full" style={{ width, backgroundColor: color }} />
    </View>
  );
}

/**
 * This month's spending at a glance: the total, how it compares with last
 * month, how much of the budget is used, and where the money went.
 */
export function SpendingSummary({
  purchases,
  currency,
  budget,
  now,
  exporting,
  onExport,
}: {
  purchases: Purchase[];
  currency: string;
  budget: number | null;
  now: number;
  exporting?: boolean;
  onExport?: () => void;
}) {
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const categoryLabel = useCategoryLabeler();
  const month = currentMonth(new Date(now));
  const current = useMemo(() => summarizeMonth(purchases, month), [month, purchases]);
  const previous = useMemo(
    () => summarizeMonth(purchases, previousMonth(month)),
    [month, purchases],
  );

  const language = locale === "ar" ? "ar" : "en";
  const [year, monthIndex] = month.split("-").map(Number);
  const monthName = new Intl.DateTimeFormat(language, { month: "long" }).format(
    new Date(year, monthIndex - 1, 1),
  );
  const previousName = new Intl.DateTimeFormat(language, { month: "long" }).format(
    new Date(year, monthIndex - 2, 1),
  );

  const danger = scheme === "dark" ? "#F07178" : "#C2414A";
  const warning = scheme === "dark" ? "#E6B450" : "#B7791F";
  const used = budget ? current.total / budget : 0;
  const budgetColor = used >= 1 ? danger : used >= WARN_AT ? warning : colors.accent;
  const track = withAlpha(colors.muted, 0.2);

  let comparison: string | null = null;
  if (previous.total > 0) {
    const change = Math.round(((current.total - previous.total) / previous.total) * 100);
    const amount = formatMoney(previous.total, currency);
    comparison =
      change === 0
        ? t("spendSame", { month: previousName, amount })
        : t(change > 0 ? "spendMore" : "spendLess", {
            percent: Math.abs(change),
            month: previousName,
            amount,
          });
  }

  const shown = current.byCategory.slice(0, CATEGORIES_SHOWN);
  const rest = current.byCategory.slice(CATEGORIES_SHOWN).reduce((sum, row) => sum + row.total, 0);
  const rows = rest > 0 ? [...shown, { category: "__rest__", total: rest }] : shown;
  const largest = rows.reduce((max, row) => Math.max(max, row.total), 0);

  return (
    <View className="mb-4 gap-3">
      <View className="rounded-3xl bg-cove-paper px-4 py-4">
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <AppText className="text-sm text-cove-muted">{monthName}</AppText>
            <AppText className="mt-1 text-2xl font-semibold text-cove-ink">
              {formatMoney(current.total, currency)}
            </AppText>
          </View>
          {onExport && current.count > 0 ? (
            <Pressable
              onPress={onExport}
              disabled={exporting}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("exportTitle")}
              className="h-10 w-10 items-center justify-center rounded-full bg-cove-mist active:opacity-80"
              style={{ opacity: exporting ? 0.5 : 1 }}
            >
              <Ionicons name="share-outline" size={18} color={colors.accent} />
            </Pressable>
          ) : null}
        </View>
        {comparison ? (
          <AppText className="mt-1 text-xs text-cove-muted">{comparison}</AppText>
        ) : null}

        {budget ? (
          <View className="mt-3 gap-1.5">
            <Bar fraction={used} color={budgetColor} track={track} />
            <AppText
              className="text-xs font-semibold"
              style={{ color: used >= WARN_AT ? budgetColor : colors.muted }}
            >
              {used >= 1
                ? t("budgetOver", {
                    amount: formatMoney(current.total - budget, currency),
                    budget: formatMoney(budget, currency),
                  })
                : t("budgetUsed", {
                    percent: Math.round(used * 100),
                    budget: formatMoney(budget, currency),
                    left: formatMoney(budget - current.total, currency),
                  })}
            </AppText>
          </View>
        ) : null}

        {current.unpriced > 0 ? (
          <AppText className="mt-2 text-xs text-cove-muted">
            {t("spendUnpriced", { count: current.unpriced })}
          </AppText>
        ) : null}
      </View>

      {rows.length > 0 ? (
        <View className="rounded-3xl bg-cove-paper px-4 py-4">
          <AppText className="text-sm font-semibold text-cove-ink">{t("spendByCategory")}</AppText>
          {rows.map((row) => (
            <View key={row.category} className="mt-3 gap-1.5">
              <View className="flex-row items-center justify-between gap-3">
                <AppText className="min-w-0 flex-1 text-sm text-cove-ink" numberOfLines={1}>
                  {row.category === TRIP_TOTALS
                    ? t("tripTotals")
                    : row.category === "__rest__"
                      ? t("spendOtherCategories")
                      : categoryLabel(row.category)}
                </AppText>
                <AppText className="text-sm text-cove-muted">
                  {formatMoney(row.total, currency)}
                </AppText>
              </View>
              <Bar fraction={largest > 0 ? row.total / largest : 0} color={colors.accent} track={track} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
