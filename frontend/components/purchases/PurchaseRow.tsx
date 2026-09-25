import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { getCategoryLabel } from "@/constants/categories";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/types/purchase";
import { StatusBadge, UrgentBadge } from "./StatusBadge";

type PurchaseRowProps = {
  purchase: Purchase;
  onPress?: () => void;
  onLongPress?: () => void;
  onUndo?: () => void;
  onBuyAgain?: () => void;
  onChangeQuantity?: (quantity: number) => void;
  quantityBusy?: boolean;
  selected?: boolean;
};

export function PurchaseRow({
  purchase,
  onPress,
  onLongPress,
  onUndo,
  onBuyAgain,
  onChangeQuantity,
  quantityBusy = false,
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
    <View
      className={`rounded-3xl border-2 px-4 py-4 ${
        selected
          ? "border-cove-accent bg-cove-mist"
          : "border-transparent bg-cove-paper"
      }`}
    >
      <View className="flex-row items-start gap-3">
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={350}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          className="min-w-0 flex-1 active:opacity-80"
        >
          <AppText className="text-base font-semibold text-cove-ink">
            {purchase.name}
          </AppText>
          <AppText className="mt-1 text-sm text-cove-muted">
            {quantityLabel} · {getCategoryLabel(purchase.category, locale)} ·{" "}
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
        </Pressable>
        {selected ? (
          <Ionicons
            name="checkmark-circle"
            size={28}
            color={colors.accent}
          />
        ) : (
          <View className="items-end gap-2">
            <View className="flex-row items-center gap-2">
              {purchase.urgent && purchase.status !== "bought" ? <UrgentBadge /> : null}
              <StatusBadge status={purchase.status} />
            </View>
            {onChangeQuantity && purchase.status === "needed" ? (
              <View className="flex-row items-center gap-1">
                <Pressable
                  disabled={quantityBusy || purchase.quantity <= 1}
                  onPress={() => {
                    const next = purchase.quantity - 1;
                    onChangeQuantity(next < 1 ? 1 : next);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("decreaseQuantity")}
                  className={`h-7 w-7 items-center justify-center rounded-full bg-cove-mist ${
                    quantityBusy || purchase.quantity <= 1 ? "opacity-40" : "active:opacity-80"
                  }`}
                >
                  <Ionicons name="remove" size={16} color={colors.accent} />
                </Pressable>
                <AppText className="min-w-6 text-center text-sm font-semibold text-cove-ink">
                  {quantityLabel}
                </AppText>
                <Pressable
                  disabled={quantityBusy}
                  onPress={() => onChangeQuantity(purchase.quantity + 1)}
                  accessibilityRole="button"
                  accessibilityLabel={t("increaseQuantity")}
                  className={`h-7 w-7 items-center justify-center rounded-full bg-cove-mist ${
                    quantityBusy ? "opacity-40" : "active:opacity-80"
                  }`}
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                </Pressable>
              </View>
            ) : null}
          </View>
        )}
      </View>
      {onUndo || onBuyAgain ? (
        <View className="mt-3 flex-row flex-wrap gap-4">
          {onUndo ? (
            <Pressable onPress={onUndo} className="active:opacity-80">
              <AppText className="text-sm font-semibold text-cove-accent">{t("undoBought")}</AppText>
            </Pressable>
          ) : null}
          {onBuyAgain ? (
            <Pressable
              onPress={onBuyAgain}
              accessibilityRole="button"
              accessibilityLabel={t("buyAgain")}
              className="active:opacity-80"
            >
              <AppText className="text-sm font-semibold text-cove-accent">{t("buyAgain")}</AppText>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
