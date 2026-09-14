import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getCategoryLabel } from "@/constants/categories";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/types/purchase";
import { StatusBadge } from "./StatusBadge";

type PurchaseRowProps = {
  purchase: Purchase;
  onPress?: () => void;
  onLongPress?: () => void;
  selected?: boolean;
};

export function PurchaseRow({
  purchase,
  onPress,
  onLongPress,
  selected = false,
}: PurchaseRowProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `x${purchase.quantity}`;
  const timestamp =
    purchase.status === "bought"
      ? (purchase.boughtAt ?? purchase.createdAt)
      : purchase.createdAt;
  const date = timestamp
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(new Date(timestamp))
    : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-3xl border-2 px-4 py-4 active:opacity-80 ${
        selected
          ? "border-cove-accent bg-cove-mist"
          : "border-transparent bg-cove-paper"
      }`}
    >
      <View className="min-w-0">
        <View className="flex-row items-start justify-between gap-3">
          <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
            {purchase.name}
          </AppText>
          {selected ? (
            <Ionicons
              name="checkmark-circle"
              size={28}
              color={colors.accent}
            />
          ) : (
            <StatusBadge status={purchase.status} />
          )}
        </View>
        <AppText className="mt-1 text-sm text-cove-muted">
          {quantityLabel} · {getCategoryLabel(purchase.category)} ·{" "}
          {purchase.status === "bought"
            ? t("boughtByName", { name: purchase.boughtByName ?? "" })
            : t("addedByName", { name: purchase.addedByName })}
        </AppText>
        {date ? (
          <View className="mt-2 flex-row items-center gap-1.5">
            <Ionicons
              name="calendar-outline"
              size={14}
              color={colors.muted}
            />
            <AppText className="text-xs text-cove-muted">
              {purchase.status === "bought"
                ? t("boughtOn", { date })
                : t("addedOn", { date })}
            </AppText>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
