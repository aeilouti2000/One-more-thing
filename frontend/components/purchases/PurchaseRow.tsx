import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
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
  onUndo?: () => void;
  onBuyAgain?: () => void;
  onChangeQuantity?: (quantity: number) => void;
  quantityBusy?: boolean;
  selected?: boolean;
  leading?: ReactNode;
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
  leading,
}: PurchaseRowProps) {
  const { t, locale } = useI18n();
  const { colors, scheme } = useTheme();
  const showsStepper = !selected && Boolean(onChangeQuantity) && purchase.status === "needed";
  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `${purchase.quantity}`;

  return (
    <View
      className={`rounded-3xl border-2 px-4 py-3.5 ${
        selected
          ? "border-cove-accent bg-cove-mist"
          : "border-transparent bg-cove-paper"
      }`}
      style={
        selected
          ? undefined
          : {
              shadowColor: scheme === "dark" ? "#000000" : "#0D47A1",
              shadowOpacity: scheme === "dark" ? 0.28 : 0.08,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }
      }
    >
      <View className="flex-row items-start gap-3">
        {leading ? <View className="pt-1">{leading}</View> : null}
        <View className="min-w-0 flex-1 gap-2.5">
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onPress}
              onLongPress={onLongPress}
              delayLongPress={350}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className="min-w-0 flex-1 active:opacity-80"
            >
              <AppText numberOfLines={1} className="text-xl font-semibold text-cove-ink">
                {purchase.name}
              </AppText>
            </Pressable>
            {selected ? (
              <Pressable
                onPress={onPress}
                onLongPress={onLongPress}
                delayLongPress={350}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
              </Pressable>
            ) : showsStepper && onChangeQuantity ? (
              <View
                className="flex-row items-center rounded-full px-1 py-0.5"
                style={{ backgroundColor: colors.mist }}
              >
                <Pressable
                  disabled={quantityBusy || purchase.quantity <= 1}
                  onPress={() => {
                    const next = purchase.quantity - 1;
                    onChangeQuantity(next < 1 ? 1 : next);
                  }}
                  onLongPress={onLongPress}
                  delayLongPress={350}
                  accessibilityRole="button"
                  accessibilityLabel={t("decreaseQuantity")}
                  className={`h-8 w-8 items-center justify-center ${
                    quantityBusy || purchase.quantity <= 1 ? "opacity-40" : "active:opacity-80"
                  }`}
                >
                  <Ionicons name="remove" size={16} color={colors.accent} />
                </Pressable>
                <AppText className="min-w-5 text-center text-base font-semibold text-cove-ink">
                  {quantityLabel}
                </AppText>
                <Pressable
                  disabled={quantityBusy}
                  onPress={() => onChangeQuantity(purchase.quantity + 1)}
                  onLongPress={onLongPress}
                  delayLongPress={350}
                  accessibilityRole="button"
                  accessibilityLabel={t("increaseQuantity")}
                  className={`h-8 w-8 items-center justify-center ${
                    quantityBusy ? "opacity-40" : "active:opacity-80"
                  }`}
                >
                  <Ionicons name="add" size={16} color={colors.accent} />
                </Pressable>
              </View>
            ) : (
              <AppText className="text-sm font-semibold text-cove-muted">{quantityLabel}</AppText>
            )}
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onPress}
              onLongPress={onLongPress}
              delayLongPress={350}
              className="min-w-0 flex-1 flex-row items-center gap-1.5 overflow-hidden active:opacity-80"
            >
              <View className="min-w-0 overflow-hidden rounded-full bg-cove-mist px-2.5 py-1">
                <AppText numberOfLines={1} className="text-xs font-semibold text-cove-accent">
                  {getCategoryLabel(purchase.category, locale)}
                </AppText>
              </View>
              {purchase.notes?.trim() ? (
                <View
                  accessibilityLabel={t("notes")}
                  className="h-6 w-6 items-center justify-center rounded-full bg-cove-mist"
                >
                  <Ionicons name="document-text-outline" size={14} color={colors.accent} />
                </View>
              ) : null}
              {purchase.urgent && purchase.status !== "bought" ? (
                <View
                  className="rounded-full px-2.5 py-1"
                  style={{ backgroundColor: scheme === "dark" ? "rgba(220,38,38,0.22)" : "#FEE2E2" }}
                >
                  <AppText className="text-xs font-semibold" style={{ color: "#DC2626" }}>
                    {t("urgent")}
                  </AppText>
                </View>
              ) : null}
              {purchase.status === "bought" ? <StatusBadge status={purchase.status} /> : null}
            </Pressable>
          </View>
        </View>
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
