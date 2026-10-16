import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { formatMoney } from "@/features/items/utils/currency";
import { useCategoryLabel } from "@/features/items/providers/categories-provider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/features/items/types/purchase";
import { StatusBadge } from "./status-badge";

const CARD_RADIUS = 16;
const SELECTION_BORDER = 2;
const URGENT_COLOR = "#F43F5E";
const URGENT_FLAG = 48;
const URGENT_BAND = 20;

type PurchaseRowProps = {
  purchase: Purchase;
  onPress?: () => void;
  onLongPress?: () => void;
  onUndo?: () => void;
  onBuyAgain?: () => void;
  buyAgainBusy?: boolean;
  onChangeQuantity?: (quantity: number) => void;
  quantityBusy?: boolean;
  selected?: boolean;
  leading?: ReactNode;
  showCategory?: boolean;
};

export function PurchaseRow({
  purchase,
  onPress,
  onLongPress,
  onUndo,
  onBuyAgain,
  buyAgainBusy = false,
  onChangeQuantity,
  quantityBusy = false,
  selected = false,
  leading,
  showCategory = true,
}: PurchaseRowProps) {
  const { t, isRTL } = useI18n();
  const { household } = useHousehold();
  const categoryLabel = useCategoryLabel(purchase.category);
  const { colors, scheme } = useTheme();
  const showsStepper = !selected && Boolean(onChangeQuantity) && purchase.status === "needed";
  const isUrgent = purchase.urgent && purchase.status !== "bought";
  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `${purchase.quantity}`;
  const costLabel =
    household?.costsEnabled && purchase.status === "bought"
      ? formatMoney(purchase.cost, household.currency, t("noPrice"))
      : null;

  const cardRadius = {
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        ...cardRadius,
        backgroundColor: selected ? colors.mist : colors.paper,
        shadowColor: scheme === "dark" ? "#000000" : colors.ink,
        shadowOpacity: selected ? 0 : scheme === "dark" ? 0.22 : 0.045,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: selected ? 0 : 1,
      }}
    >
      <View
        pointerEvents="box-none"
        style={{
          ...cardRadius,
          overflow: "hidden",
          backgroundColor: selected ? colors.mist : colors.paper,
        }}
      >
      {isUrgent ? <UrgentCornerFlag isRTL={isRTL} label={t("urgent")} /> : null}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={[
          purchase.name,
          isUrgent ? t("urgent") : null,
          purchase.notes?.trim() ? t("notes") : null,
        ]
          .filter(Boolean)
          .join(", ")}
        accessibilityState={{ selected }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="box-none"
        style={{
          paddingTop: 16,
          paddingBottom: 16,
          paddingStart: 18,
          paddingEnd: isUrgent ? 20 : 18,
        }}
      >
        <View pointerEvents="box-none" className="flex-row items-center gap-3">
          {leading ? (
            <View pointerEvents="box-none">
              {leading}
            </View>
          ) : null}
          <View pointerEvents="box-none" className="min-w-0 flex-1 gap-2.5">
            <View pointerEvents="box-none" className="flex-row items-center gap-2">
              <View pointerEvents="none" className="min-w-0 flex-1 flex-row items-center gap-1.5">
                <AppText
                  numberOfLines={1}
                  className="shrink text-base font-semibold text-cove-ink"
                >
                  {purchase.name}
                </AppText>
                {purchase.notes?.trim() ? (
                  <Ionicons
                    name="document-text-outline"
                    size={15}
                    color={colors.muted}
                    accessibilityLabel={t("notes")}
                  />
                ) : null}
              </View>
              {selected ? (
                <View pointerEvents="none">
                  <Ionicons name="checkmark-circle" size={26} color={colors.accent} />
                </View>
              ) : showsStepper && onChangeQuantity ? (
                <View pointerEvents="box-none" className="flex-row items-center gap-1.5">
                  <Pressable
                    onPress={() => {
                      if (quantityBusy || purchase.quantity <= 1) return;
                      onChangeQuantity(-1);
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
                      if (quantityBusy || purchase.quantity >= 9999) return;
                      onChangeQuantity(1);
                    }}
                    onLongPress={onLongPress}
                    delayLongPress={350}
                    accessibilityRole="button"
                    accessibilityLabel={t("increaseQuantity")}
                    className={`h-8 w-8 items-center justify-center rounded-full bg-cove-accent ${
                      quantityBusy ? "opacity-40" : "active:opacity-80"
                    }`}
                  >
                    <Ionicons name="add" size={16} color={colors.onAccent} />
                  </Pressable>
                </View>
              ) : (
                <View pointerEvents="box-none" className="flex-row items-center gap-1.5">
                  {onUndo ? (
                    <Pressable
                      onPress={onUndo}
                      onLongPress={onLongPress}
                      delayLongPress={350}
                      accessibilityRole="button"
                      accessibilityLabel={t("undoBought")}
                      hitSlop={6}
                      className="h-8 w-8 items-center justify-center rounded-full border border-cove-line active:opacity-80"
                      style={{ backgroundColor: scheme === "dark" ? colors.soft : colors.paper }}
                    >
                      <Ionicons name="arrow-undo-outline" size={16} color={colors.accent} />
                    </Pressable>
                  ) : null}
                  {onBuyAgain || buyAgainBusy ? (
                    <Pressable
                      disabled={buyAgainBusy || !onBuyAgain}
                      onPress={onBuyAgain}
                      onLongPress={onLongPress}
                      delayLongPress={350}
                      accessibilityRole="button"
                      accessibilityLabel={t("buyAgain")}
                      hitSlop={6}
                      className={`h-8 w-8 items-center justify-center rounded-full bg-cove-accent ${
                        buyAgainBusy ? "opacity-40" : "active:opacity-80"
                      }`}
                    >
                      {buyAgainBusy ? (
                        <ActivityIndicator size="small" color={colors.onAccent} />
                      ) : (
                        <Ionicons name="cart-outline" size={16} color={colors.onAccent} />
                      )}
                    </Pressable>
                  ) : (
                    <View pointerEvents="none">
                      <AppText className="text-sm font-semibold text-cove-muted">{quantityLabel}</AppText>
                    </View>
                  )}
                </View>
              )}
            </View>
            {showCategory || purchase.status === "bought" ? (
            <View pointerEvents="none" className="flex-row items-center gap-1.5 overflow-hidden">
              {showCategory ? (
                <View className="min-w-0 overflow-hidden rounded-full bg-cove-mist px-2.5 py-1">
                  <AppText numberOfLines={1} className="text-xs font-semibold text-cove-accent">
                    {categoryLabel}
                  </AppText>
                </View>
              ) : null}
              {purchase.status === "bought" ? <StatusBadge status={purchase.status} /> : null}
              {purchase.status === "bought" && costLabel ? (
                <View className="rounded-full bg-cove-mist px-2.5 py-1">
                  <AppText className="text-xs font-semibold text-cove-accent">{costLabel}</AppText>
                </View>
              ) : null}
            </View>
            ) : null}
          </View>
        </View>
      </View>
      </View>
      {selected ? (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              ...cardRadius,
              borderWidth: SELECTION_BORDER,
              borderColor: colors.accent,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

function UrgentCornerFlag({ isRTL, label }: { isRTL: boolean; label: string }) {
  return (
    <View
      pointerEvents="none"
      accessibilityLabel={label}
      style={{
        position: "absolute",
        top: 0,
        width: URGENT_FLAG,
        height: URGENT_FLAG,
        overflow: "hidden",
        zIndex: 2,
        ...(isRTL ? { left: 0 } : { right: 0 }),
      }}
    >
      <View
        style={{
          position: "absolute",
          top: -1,
          width: URGENT_FLAG * 1.5,
          height: URGENT_BAND,
          backgroundColor: URGENT_COLOR,
          alignItems: "center",
          justifyContent: "center",
          ...(isRTL
            ? { left: -26, transform: [{ rotate: "-45deg" }] }
            : { right: -26, transform: [{ rotate: "45deg" }] }),
        }}
      >
        <Ionicons
          name="flame"
          size={12}
          color="#FFFFFF"
          style={{ transform: [{ rotate: isRTL ? "45deg" : "-45deg" }] }}
        />
      </View>
    </View>
  );
}
