import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { cardLift } from "@/constants/theme";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { formatMoney } from "@/features/items/utils/currency";
import { useCategoryLabel } from "@/features/items/providers/categories-provider";
import { KEEP_MOTION } from "@/lib/motion";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/features/items/types/purchase";
import { ItemPhotoThumb, itemPhotoUri } from "./item-photo";
import { StatusBadge } from "./status-badge";

export const CARD_RADIUS = 22;
const SELECTION_BORDER = 2;
const URGENT_COLOR = "#EF4444";
const URGENT_DOT = 6;
/** How long the − / + stay open after the last tap before folding away. */
const STEPPER_IDLE_MS = 2500;

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
  /**
   * The copy that follows the finger while a row is dragged. It stays solid
   * in the glass theme, so the rows it passes over do not show through it.
   */
  lifted?: boolean;
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
  lifted = false,
  leading,
  showCategory = true,
}: PurchaseRowProps) {
  const { t } = useI18n();
  const { household } = useHousehold();
  const categoryLabel = useCategoryLabel(purchase.category);
  const { colors, glass, scheme } = useTheme();
  const motionOff = useMotionOff();
  const photoUri = itemPhotoUri(purchase, "thumb");
  const showsStepper = !selected && Boolean(onChangeQuantity) && purchase.status === "needed";
  const isUrgent = purchase.urgent && purchase.status !== "bought";
  // The row shows only a small quantity chip; tapping it opens the − / +
  // in place, and they fold away again once left alone.
  // Remembered per item, because a row can be reused for a different one.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const stepperOpen = openFor === purchase.id;
  const stepperTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function keepStepperOpen() {
    if (stepperTimer.current) clearTimeout(stepperTimer.current);
    stepperTimer.current = setTimeout(() => setOpenFor(null), STEPPER_IDLE_MS);
  }

  function openStepper() {
    setOpenFor(purchase.id);
    keepStepperOpen();
  }

  useEffect(
    () => () => {
      if (stepperTimer.current) clearTimeout(stepperTimer.current);
    },
    [],
  );
  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `${purchase.quantity}`;
  // Someone couldn't find it on a trip: everyone sees it until it's bought.
  const notFoundLabel =
    purchase.status === "needed" && purchase.notFoundAt
      ? t("notFoundTag", { name: purchase.notFoundByName ?? t("partner") })
      : null;
  const notFoundColor = scheme === "dark" ? "#F5B454" : "#B45309";
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

  const surface = glass && lifted ? colors.overlay : selected ? colors.mist : colors.paper;
  // A glass row is one see-through layer: the layer below paints it, and it
  // casts no shadow (the shadow would show through it).
  const seeThrough = glass && !lifted;

  return (
    <View
      pointerEvents="box-none"
      style={{
        ...cardRadius,
        backgroundColor: seeThrough ? "transparent" : surface,
        shadowColor: scheme === "dark" ? "#000000" : colors.ink,
        shadowOpacity: selected ? 0 : scheme === "dark" ? 0.22 : 0.045,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        ...cardLift(seeThrough, selected ? 0 : 1),
      }}
    >
      <View
        pointerEvents="box-none"
        style={{
          ...cardRadius,
          overflow: "hidden",
          backgroundColor: surface,
        }}
      >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={350}
        accessibilityRole="button"
        accessibilityLabel={[
          purchase.name,
          isUrgent ? t("urgent") : null,
          notFoundLabel,
          purchase.notes?.trim() ? t("notes") : null,
          photoUri ? t("itemPhoto") : null,
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
          paddingEnd: 18,
        }}
      >
        <View pointerEvents="box-none" className="flex-row items-center gap-3">
          {leading ? (
            <View pointerEvents="box-none">
              {leading}
            </View>
          ) : null}
          {photoUri ? (
            <View pointerEvents="none">
              <ItemPhotoThumb uri={photoUri} size={44} radius={12} uploading={purchase.photoUploading} hash={purchase.imageHash} />
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
                {isUrgent ? <UrgentChip label={t("urgent")} /> : null}
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
                  <Ionicons name="checkmark-circle" size={26} color={colors.accentText} />
                </View>
              ) : showsStepper && onChangeQuantity && !stepperOpen ? (
                <Pressable
                  onPress={openStepper}
                  onLongPress={onLongPress}
                  delayLongPress={350}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`${t("quantity")}: ${quantityLabel}`}
                  className="h-7 min-w-9 items-center justify-center rounded-full border border-cove-line px-2.5 active:opacity-80"
                  style={{ backgroundColor: scheme === "dark" ? colors.soft : colors.paper }}
                >
                  <AppText className="text-sm font-semibold text-cove-ink">
                    {quantityLabel}
                  </AppText>
                </Pressable>
              ) : showsStepper && onChangeQuantity ? (
                <Animated.View
                  entering={motionOff ? undefined : FadeIn.duration(140)}
                  pointerEvents="box-none"
                  className="flex-row items-center gap-1.5"
                >
                  <Pressable
                    onPress={() => {
                      keepStepperOpen();
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
                    <Ionicons name="remove" size={16} color={colors.accentText} />
                  </Pressable>
                  <View pointerEvents="none">
                    <AppText className="min-w-6 text-center text-sm font-semibold text-cove-ink">
                      {quantityLabel}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => {
                      keepStepperOpen();
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
                </Animated.View>
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
                      <Ionicons name="arrow-undo-outline" size={16} color={colors.accentText} />
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
            {showCategory || purchase.status === "bought" || notFoundLabel ? (
            <View pointerEvents="none" className="flex-row items-center gap-1.5 overflow-hidden">
              {showCategory ? (
                <View className="min-w-0 overflow-hidden rounded-full bg-cove-mist px-2.5 py-1">
                  <AppText numberOfLines={1} className="text-xs font-semibold text-cove-accent-text">
                    {categoryLabel}
                  </AppText>
                </View>
              ) : null}
              {notFoundLabel ? (
                <View
                  className="min-w-0 flex-row items-center gap-1 overflow-hidden rounded-full px-2.5 py-1"
                  style={{ backgroundColor: `${notFoundColor}22` }}
                >
                  <Ionicons name="search-outline" size={12} color={notFoundColor} />
                  <AppText
                    numberOfLines={1}
                    className="shrink text-xs font-semibold"
                    style={{ color: notFoundColor }}
                  >
                    {notFoundLabel}
                  </AppText>
                </View>
              ) : null}
              {purchase.status === "bought" ? <StatusBadge status={purchase.status} /> : null}
              {purchase.status === "bought" && costLabel ? (
                <View className="rounded-full bg-cove-mist px-2.5 py-1">
                  <AppText className="text-xs font-semibold text-cove-accent-text">{costLabel}</AppText>
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
              borderColor: colors.accentText,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

/** "Urgent" next to the name, with a small red dot that slowly breathes. */
function UrgentChip({ label }: { label: string }) {
  const { scheme } = useTheme();
  const dark = scheme === "dark";
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.set(
      withRepeat(
        withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }),
        -1,
        false,
        undefined,
        // "Urgent" keeps breathing with animations off: it is a status, not decoration.
        KEEP_MOTION,
      ),
    );
  }, [breath]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.75 * (1 - breath.value),
    transform: [{ scale: 1 + 2 * breath.value }],
  }));

  return (
    <View
      className="shrink-0 flex-row items-center gap-1.5 rounded-full py-0.5 ps-2 pe-2.5"
      style={{ backgroundColor: dark ? "rgba(239,68,68,0.16)" : "rgba(239,68,68,0.12)" }}
    >
      <View style={{ width: URGENT_DOT, height: URGENT_DOT }}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: URGENT_DOT / 2, backgroundColor: URGENT_COLOR },
            ring,
          ]}
        />
        <View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: URGENT_DOT / 2, backgroundColor: URGENT_COLOR },
          ]}
        />
      </View>
      <AppText
        className="text-xs font-bold"
        style={{ color: dark ? "#FCA5A5" : "#B91C1C" }}
      >
        {label}
      </AppText>
    </View>
  );
}
