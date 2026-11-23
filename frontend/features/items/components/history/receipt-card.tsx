import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { HomeIcon } from "@/components/ui/HomeIcon";
import { cardLift, withAlpha } from "@/constants/theme";
import type { HistoryTrip } from "@/features/items/api/history";
import { listLabel } from "@/features/items/api/lists";
import { formatTripWhen } from "@/features/items/components/history/trip-invoice";
import { formatMoney } from "@/features/items/utils/currency";
import { unpricedCount } from "@/features/items/utils/history";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * One shopping trip on the Invoices page, drawn as a receipt: the shop's icon,
 * its name (or the time, for a trip with no name), the list, the total; under
 * that, the item count and a tag when some items have no price.
 */
export function ReceiptCard({
  trip,
  currency,
  selected = false,
  onOpen,
}: {
  trip: HistoryTrip;
  currency: string;
  selected?: boolean;
  onOpen: () => void;
}) {
  const { t, locale, isRTL } = useI18n();
  const { colors, glass, scheme } = useTheme();
  const when = formatTripWhen(trip.startedAt, locale);
  const list = listLabel(trip.listName ?? "", t("defaultList"));
  const unpriced = unpricedCount(trip);
  const warn = scheme === "dark" ? { bg: "#3a2a10", fg: "#f3c477" } : { bg: "#FFF1DC", fg: "#9A5B00" };

  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${trip.name ?? when}, ${formatMoney(trip.total, currency)}`}
      className="mb-3 overflow-hidden rounded-[20px] active:opacity-80"
      style={{
        backgroundColor: selected ? withAlpha(colors.accentText, 0.12) : colors.paper,
        shadowColor: scheme === "dark" ? "#000000" : colors.ink,
        shadowOpacity: scheme === "dark" ? 0.22 : 0.06,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 2 },
        ...cardLift(glass, 1),
      }}
    >
      <View className="flex-row items-center gap-2.5 px-3 pb-2.5 pt-3">
        <HomeIcon kind="shop" name={trip.name} size={38} />
        <View className="min-w-0 flex-1">
          <AppText className="text-sm font-semibold text-cove-ink" numberOfLines={1}>
            {trip.name ?? when}
          </AppText>
          <AppText className="mt-0.5 text-xs text-cove-muted" numberOfLines={1}>
            {trip.name ? `${when} · ` : ""}
            {list}
          </AppText>
        </View>
        <AppText className="text-base font-semibold text-cove-ink" style={{ fontVariant: ["tabular-nums"] }}>
          {formatMoney(trip.total, currency)}
        </AppText>
        <Ionicons name={isRTL ? "chevron-back" : "chevron-forward"} size={16} color={colors.muted} />
      </View>
      <View className="flex-row items-center gap-1.5 px-3 pb-3 pt-0.5">
        <AppText className="text-xs text-cove-muted" numberOfLines={1}>
          {t("invoiceTripCount", { count: trip.itemCount })}
        </AppText>
        {unpriced > 0 ? (
          <View className="ms-auto rounded-full px-2 py-0.5" style={{ backgroundColor: warn.bg }}>
            <AppText className="text-[10px] font-semibold" style={{ color: warn.fg }}>
              {t("historyNoPriceCount", { count: unpriced })}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
