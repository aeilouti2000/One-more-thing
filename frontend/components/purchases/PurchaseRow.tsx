import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useCategoryLabel } from "@/providers/CategoriesProvider";
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
  const { t } = useI18n();
  const categoryLabel = useCategoryLabel(purchase.category);
  const { colors, scheme } = useTheme();
  const showsStepper = !selected && Boolean(onChangeQuantity) && purchase.status === "needed";
  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `${purchase.quantity}`;

  return (
    <View
      pointerEvents="box-none"
      className={`rounded-3xl border-2 ${
        selected ? "border-cove-accent bg-cove-mist" : "border-transparent bg-cove-paper"
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
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={purchase.name}
        accessibilityState={{ selected }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="box-none" className="px-4 py-3.5">
        <View pointerEvents="box-none" className="flex-row items-start gap-3">
          {leading ? (
            <View pointerEvents="box-none" className="pt-1">
              {leading}
            </View>
          ) : null}
          <View pointerEvents="box-none" className="min-w-0 flex-1 gap-2.5">
            <View pointerEvents="box-none" className="flex-row items-start gap-2">
              <View pointerEvents="none" className="min-w-0 flex-1">
                <AppText numberOfLines={2} className="text-base font-semibold text-cove-ink">
                  {purchase.name}
                </AppText>
              </View>
              {selected ? (
                <View pointerEvents="none" className="pt-0.5">
                  <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
                </View>
              ) : showsStepper && onChangeQuantity ? (
                <View pointerEvents="box-none" className="flex-row items-center gap-1.5 pt-0.5">
                  <Pressable
                    onPress={() => {
                      if (quantityBusy || purchase.quantity <= 1) return;
                      const next = purchase.quantity - 1;
                      onChangeQuantity(next < 1 ? 1 : next);
                    }}
                    onLongPress={onLongPress}
                    delayLongPress={350}
                    accessibilityRole="button"
                    accessibilityLabel={t("decreaseQuantity")}
                    className={`h-8 w-8 items-center justify-center rounded-full border border-cove-line ${
                      quantityBusy || purchase.quantity <= 1 ? "opacity-40" : "active:opacity-80"
                    }`}
                    style={{ backgroundColor: scheme === "dark" ? colors.soft : colors.paper }}
                  >
                    <Ionicons name="remove" size={16} color={colors.accent} />
                  </Pressable>
                  <View pointerEvents="none">
                    <AppText className="min-w-6 text-center text-sm font-semibold text-cove-ink">
                      {quantityLabel}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => {
                      if (quantityBusy) return;
                      onChangeQuantity(purchase.quantity + 1);
                    }}
                    onLongPress={onLongPress}
                    delayLongPress={350}
                    accessibilityRole="button"
                    accessibilityLabel={t("increaseQuantity")}
                    className={`h-8 w-8 items-center justify-center rounded-full bg-cove-accent ${
                      quantityBusy ? "opacity-40" : "active:opacity-80"
                    }`}
                  >
                    <Ionicons name="add" size={16} color={colors.white} />
                  </Pressable>
                </View>
              ) : (
                <View pointerEvents="none" className="pt-0.5">
                  <AppText className="text-sm font-semibold text-cove-muted">{quantityLabel}</AppText>
                </View>
              )}
            </View>
            <View pointerEvents="none" className="flex-row items-center gap-1.5 overflow-hidden">
              <View className="min-w-0 overflow-hidden rounded-full bg-cove-mist px-2.5 py-1">
                <AppText numberOfLines={1} className="text-xs font-semibold text-cove-accent">
                  {categoryLabel}
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
                  style={{ backgroundColor: "rgba(248, 113, 113, 0.18)" }}
                >
                  <AppText className="text-xs font-semibold" style={{ color: "#F87171" }}>
                    {t("urgent")}
                  </AppText>
                </View>
              ) : null}
              {purchase.status === "bought" ? <StatusBadge status={purchase.status} /> : null}
            </View>
          </View>
        </View>
        {onUndo || onBuyAgain ? (
          <View pointerEvents="box-none" className="mt-3 flex-row flex-wrap gap-4">
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
    </View>
  );
}
