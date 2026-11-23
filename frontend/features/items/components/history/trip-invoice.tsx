import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { HomeIcon } from "@/components/ui/HomeIcon";
import type { Purchase } from "@/features/items/types/purchase";
import { formatMoney } from "@/features/items/utils/currency";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export function formatTripWhen(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

/** An opened trip: its items, cost actions, rename, move an item, shop icon. */
export function InvoiceView({
  items,
  currency,
  periodTitle,
  listTitle,
  locale,
  total,
  priced,
  count,
  onPressItem,
  onRename,
  shopName,
  onChangeIcon,
  onMoveItem,
  actions,
}: {
  items: Purchase[];
  currency: string;
  periodTitle: string;
  listTitle?: string;
  locale: string;
  total: number;
  priced: number;
  count: number;
  onPressItem: (item: Purchase) => void;
  /** Opened trip: rename it, or move one of its items to another trip. */
  onRename?: () => void;
  /** The trip's name: its shop icon shows beside the title. */
  shopName?: string | null;
  /** Tap the shop icon to change it. */
  onChangeIcon?: () => void;
  onMoveItem?: (item: Purchase) => void;
  /** Cost actions for an opened trip (scan / item prices / trip total). */
  actions?: ReactNode;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const boughtOn = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
    month: "short",
    day: "numeric",
  });

  if (items.length === 0) {
    return (
      <EmptyState title={t("invoiceEmpty")} message={t("invoiceEmptyBody")} />
    );
  }

  return (
    <View
      className="overflow-hidden rounded-3xl border border-cove-line px-4 py-4"
      style={{ backgroundColor: scheme === "dark" ? colors.paper : colors.paper }}
    >
      <View className="flex-row items-center gap-2">
        {onChangeIcon ? (
          <Pressable
            onPress={onChangeIcon}
            accessibilityRole="button"
            accessibilityLabel={t("iconChange")}
            hitSlop={6}
            className="me-1 active:opacity-75"
          >
            <HomeIcon kind="shop" name={shopName} size={46} />
            <View
              pointerEvents="none"
              className="absolute h-[18px] w-[18px] items-center justify-center rounded-full bg-cove-accent"
              style={{ end: -4, bottom: -4, borderWidth: 2, borderColor: colors.paper }}
            >
              <Ionicons name="pencil" size={9} color={colors.onAccent} />
            </View>
          </Pressable>
        ) : null}
        <AppText className="min-w-0 flex-1 text-lg font-semibold text-cove-ink" numberOfLines={2}>
          {periodTitle}
        </AppText>
        {onRename ? (
          <Pressable
            onPress={onRename}
            accessibilityRole="button"
            accessibilityLabel={t("renameTrip")}
            hitSlop={8}
            className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: colors.mist }}
          >
            <Ionicons name="pencil" size={16} color={colors.accentText} />
          </Pressable>
        ) : null}
      </View>
      {listTitle ? (
        <AppText className="mt-1 text-sm text-cove-muted">{listTitle}</AppText>
      ) : null}
      <AppText className="mt-1 text-sm text-cove-muted">
        {t("costSummary", {
          priced,
          count,
          total: formatMoney(total, currency),
        })}
      </AppText>
      {actions}

      <View className="mt-4 gap-0">
        {items.map((item, index) => {
          const when = item.boughtAt ? boughtOn.format(new Date(item.boughtAt)) : "";
          const qty = item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
          return (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              className="flex-row items-start justify-between gap-3 py-3 active:opacity-80"
              style={
                index < items.length - 1
                  ? { borderBottomWidth: 1, borderBottomColor: colors.line }
                  : undefined
              }
            >
              <View className="min-w-0 flex-1">
                <AppText className="text-base font-semibold text-cove-ink" numberOfLines={2}>
                  {item.name}
                </AppText>
                <AppText className="mt-1 text-xs text-cove-muted">
                  {qty}
                  {item.boughtByName ? ` · ${item.boughtByName}` : ""}
                  {when ? ` · ${when}` : ""}
                </AppText>
              </View>
              {onMoveItem ? (
                <Pressable
                  onPress={() => onMoveItem(item)}
                  accessibilityRole="button"
                  accessibilityLabel={t("moveToTrip")}
                  hitSlop={8}
                  className="h-8 w-8 items-center justify-center rounded-full active:opacity-70"
                  style={{ backgroundColor: colors.mist }}
                >
                  <Ionicons name="swap-horizontal" size={15} color={colors.accentText} />
                </Pressable>
              ) : null}
              {item.receiptId && item.receiptTotal !== null && item.receiptTotal !== undefined ? (
                // Counted in the trip total; show its own price if one was typed.
                <AppText className="text-xs font-medium text-cove-muted">
                  {item.cost !== null && item.cost !== undefined
                    ? formatMoney(item.cost, currency)
                    : t("inTripTotal")}
                </AppText>
              ) : (
                <AppText className="text-base font-semibold text-cove-ink">
                  {formatMoney(item.cost, currency, t("noPrice"))}
                </AppText>
              )}
            </Pressable>
          );
        })}
      </View>

      <View className="mt-4 flex-row items-center justify-between border-t border-cove-line pt-4">
        <AppText className="text-base font-semibold text-cove-ink">{t("itemCost")}</AppText>
        <AppText className="text-lg font-semibold text-cove-accent-text">
          {formatMoney(total, currency)}
        </AppText>
      </View>
    </View>
  );
}
