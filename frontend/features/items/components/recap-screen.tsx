import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { headerActionStyle, iconSize } from "@/constants/theme";
import { RequireSession } from "@/features/auth/components/require-session";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { firstName } from "@/features/items/api/shop-locks";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { usePurchasesData } from "@/features/items/hooks/use-purchases";
import { useCategoryLabeler } from "@/features/items/providers/categories-provider";
import { formatMoney } from "@/features/items/utils/currency";
import { currentMonth, previousMonth } from "@/features/items/utils/insights";
import { summarizeRecap, type MonthRecap } from "@/features/items/utils/recap";
import { shareNeededText } from "@/features/items/utils/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function monthLabel(month: string, locale: string) {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", { month: "long" }).format(
    new Date(year, index - 1, 1),
  );
}

export default function RecapScreen() {
  return (
    <RequireSession requireHome>
      <RecapBody />
    </RequireSession>
  );
}

/** One month in numbers: what was spent, on what, by whom. Opened from History. */
function RecapBody() {
  const params = useLocalSearchParams<{ month?: string }>();
  const { purchases } = usePurchasesData();
  const { household } = useHousehold();
  const { user } = useAuth();
  const { t, locale, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const categoryLabel = useCategoryLabeler();
  const [shareError, setShareError] = useState<string | null>(null);

  // A missing or odd month in the link shows the month that just ended.
  const month =
    typeof params.month === "string" && MONTH_RE.test(params.month)
      ? params.month
      : previousMonth(currentMonth());
  const recap = useMemo(() => summarizeRecap(purchases, month), [month, purchases]);

  const costs = household?.costsEnabled === true && recap.priced;
  const currency = household?.currency ?? "JOD";
  const name = monthLabel(month, locale);
  const before = monthLabel(previousMonth(month), locale);
  const headerAction = headerActionStyle(scheme, colors);
  const good = scheme === "dark" ? "#6EE7A8" : "#2E7D32";
  const bad = scheme === "dark" ? "#F07178" : "#C2414A";

  const change =
    !costs || recap.change === null
      ? null
      : recap.change === 0
        ? { text: t("recapSame", { month: before }), color: colors.muted }
        : recap.change < 0
          ? { text: t("recapLess", { percent: -recap.change, month: before }), color: good }
          : { text: t("recapMore", { percent: recap.change, month: before }), color: bad };

  const rows = recapRows(recap, {
    costs,
    money: (amount) => formatMoney(amount, currency),
    categoryLabel,
    // Only worth a line when more than one person could have shopped.
    showShoppers: (household?.members.length ?? 0) > 1,
    shopperName: (shopper) =>
      shopper.id && shopper.id === user?.id ? t("you") : firstName(shopper.name) || shopper.name,
    t,
    riseColor: bad,
  });

  async function share() {
    setShareError(null);
    const lines = [t("recapShareTitle", { month: name })];
    if (costs) {
      lines.push(`${t("recapSpent")}: ${formatMoney(recap.total, currency)}`);
      if (change) lines.push(change.text);
    }
    for (const row of rows) lines.push(`${row.label}: ${row.value}`);
    try {
      await shareNeededText(lines.join("\n"));
    } catch (error) {
      // Closing the share sheet is not an error.
      if (error instanceof Error && error.name === "AbortError") return;
      setShareError(t("errorGeneric"));
    }
  }

  return (
    <Screen>
      <ScreenHeader
        title={name}
        subtitle={t("recapSubtitle")}
        showBack
        right={
          recap.items > 0 ? (
            <Pressable
              onPress={() => void share()}
              accessibilityRole="button"
              accessibilityLabel={t("recapShare")}
              className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: headerAction.backgroundColor }}
            >
              <Ionicons name="share-outline" size={iconSize.sm} color={headerAction.color} />
            </Pressable>
          ) : undefined
        }
      />

      <FormMessage message={shareError} />

      {recap.items === 0 ? (
        <EmptyState title={t("recapEmpty", { month: name })} message={t("recapEmptyBody")} />
      ) : (
        <View className="gap-3">
          {costs ? (
            <Animated.View
              entering={FadeInDown.duration(260)}
              className="rounded-3xl bg-cove-paper px-4 py-4"
            >
              <AppText className="text-sm text-cove-muted">{t("recapSpent")}</AppText>
              <AppText className="mt-1 text-3xl font-semibold text-cove-ink">
                {formatMoney(recap.total, currency)}
              </AppText>
              {change ? (
                <AppText className="mt-1 text-sm font-semibold" style={{ color: change.color }}>
                  {change.text}
                </AppText>
              ) : null}
            </Animated.View>
          ) : null}

          <Animated.View
            entering={FadeInDown.duration(260).delay(costs ? 70 : 0)}
            className="rounded-3xl bg-cove-paper px-4 py-1"
          >
            {rows.map((row, index) => (
              <RecapRow key={row.id} first={index === 0} label={row.label}>
                <AppText
                  numberOfLines={2}
                  className="shrink text-base font-semibold"
                  // A value on two lines stays against the far edge.
                  style={{ color: row.color ?? colors.ink, textAlign: isRTL ? "left" : "right" }}
                >
                  {row.value}
                </AppText>
              </RecapRow>
            ))}
          </Animated.View>
        </View>
      )}
    </Screen>
  );
}

function RecapRow({
  label,
  first,
  children,
}: {
  label: string;
  first: boolean;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-center justify-between gap-4 py-3"
      style={first ? undefined : { borderTopWidth: 1, borderTopColor: colors.soft }}
    >
      <AppText className="shrink-0 text-sm text-cove-muted">{label}</AppText>
      {children}
    </View>
  );
}

type Row = { id: string; label: string; value: string; color?: string };

/** The recap's lines, in order; a line with nothing to say is left out. */
function recapRows(
  recap: MonthRecap,
  options: {
    costs: boolean;
    money: (amount: number) => string;
    categoryLabel: (category: string) => string;
    showShoppers: boolean;
    shopperName: (shopper: MonthRecap["shoppers"][number]) => string;
    t: ReturnType<typeof useI18n>["t"];
    riseColor: string;
  },
): Row[] {
  const { t } = options;
  const rows: Row[] = [
    { id: "trips", label: t("recapTrips"), value: String(recap.trips) },
    { id: "items", label: t("recapItems"), value: String(recap.items) },
  ];
  if (recap.mostBought) {
    rows.push({
      id: "most",
      label: t("recapMostBought"),
      value: t("recapTimes", { name: recap.mostBought.name, times: recap.mostBought.times }),
    });
  }
  if (options.costs && recap.topCategory) {
    rows.push({
      id: "category",
      label: t("recapTopCategory"),
      value: `${options.categoryLabel(recap.topCategory.category)} · ${Math.round(
        recap.topCategory.share * 100,
      )}%`,
    });
  }
  if (options.costs && recap.biggestTrip) {
    const amount = options.money(recap.biggestTrip.total);
    rows.push({
      id: "trip",
      label: t("recapBiggestTrip"),
      value: recap.biggestTrip.name ? `${amount} · ${recap.biggestTrip.name}` : amount,
    });
  }
  if (options.costs && recap.priceRise) {
    rows.push({
      id: "rise",
      label: t("recapPriceRise"),
      value: `${recap.priceRise.name} ▲ ${recap.priceRise.percent}%`,
      color: options.riseColor,
    });
  }
  if (options.showShoppers && recap.shoppers.length > 0) {
    rows.push({
      id: "shoppers",
      label: t("recapWhoShopped"),
      value: recap.shoppers
        .map((shopper) => `${options.shopperName(shopper)} ${shopper.trips}`)
        .join(" · "),
    });
  }
  return rows;
}
