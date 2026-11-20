import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Pressable, TextInput, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { appFont, scaleFontSize, singleLineInput } from "@/constants/font";
import { caretColors, caretGap } from "@/constants/text";
import { spacing, withAlpha } from "@/constants/theme";
import {
  currencySymbol,
  formatCostInput,
  formatMoney,
  parseCostInput,
} from "@/features/items/utils/currency";
import type { ViewHandle } from "@/lib/native-refs";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** A view's place on screen, as `measureInWindow` reports it. */
export type Rect = { x: number; y: number; width: number; height: number };

/** A bought item whose price the shopper has not confirmed yet. */
export type PendingPrice = {
  id: string;
  name: string;
  /** Last price paid for it, when there is one. */
  remembered: number | null;
  /** Its price is on the way to the server; the line is already gone. */
  saving?: boolean;
};

export type TripForecast = {
  /** Expected cost of the whole trip; null once nothing is left to buy. */
  whole: number | null;
  unpriced: number;
  budget: { left: number; tone: "ok" | "warn" | "over" } | null;
};

const CARD_PAD = 16;
const CARD_BORDER = 1;
/** Gap between the pinned card and the status bar. */
const PIN_GAP = 8;
const COUNT_MS = 450;

/** Shows `value`, counting up or down to it whenever it changes. */
function useCountTo(value: number) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const startedAt = Date.now();
    let frame = requestAnimationFrame(function step() {
      const progress = Math.min(1, (Date.now() - startedAt) / COUNT_MS);
      const next = progress < 1 ? start + (value - start) * (1 - (1 - progress) ** 3) : value;
      current.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return shown;
}

type TripDockCardProps = {
  scrollY: SharedValue<number>;
  /** Top of the card's slot in the scrolling content; below zero until laid out. */
  slotY: SharedValue<number>;
  /** The card's height at the top of the page, for the slot that holds its place. */
  onNaturalHeight: (height: number) => void;
  dockRef: RefObject<ViewHandle | null>;
  estimateRef: RefObject<ViewHandle | null>;
  done: number;
  total: number;
  /** What is in the basket so far; null hides the line. */
  soFar: number | null;
  forecast: TripForecast | null;
  currency: string;
  pending: PendingPrice[];
  pendingOpen: boolean;
  onTogglePending: () => void;
  onSavePrice: (id: string, cost: number, from: Rect) => void;
  onSkipPrice: (id: string) => void;
};

/**
 * The trip's progress card. It floats over the list: it scrolls with the page
 * until it reaches the top, then stays there in a short form. Bought items wait
 * in it for their price.
 */
export function TripDockCard({
  scrollY,
  slotY,
  onNaturalHeight,
  dockRef,
  estimateRef,
  done,
  total,
  soFar,
  forecast,
  currency,
  pending,
  pendingOpen,
  onTogglePending,
  onSavePrice,
  onSkipPrice,
}: TripDockCardProps) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = scheme === "dark";
  const pinTop = insets.top + PIN_GAP;

  const share = total > 0 ? Math.min(1, done / total) : 0;
  const fill = useSharedValue(share);
  useEffect(() => {
    fill.value = withTiming(share, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [fill, share]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const shownSoFar = useCountTo(soFar ?? 0);
  const pulse = useSharedValue(1);
  const lastSoFar = useRef(soFar ?? 0);
  useEffect(() => {
    const next = soFar ?? 0;
    if (next > lastSoFar.current) {
      pulse.value = withSequence(
        withTiming(1.06, { duration: 150 }),
        withTiming(1, { duration: 220 }),
      );
    }
    lastSoFar.current = next;
  }, [pulse, soFar]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const whole =
    forecast && forecast.whole !== null
      ? t("tripWholeAmount", { amount: formatMoney(forecast.whole, currency) })
      : null;
  const budget = forecast?.budget ?? null;
  // The same amber and red History uses for the month's budget.
  const budgetColor =
    budget?.tone === "over"
      ? dark
        ? "#F07178"
        : "#C2414A"
      : budget?.tone === "warn"
        ? dark
          ? "#E6B450"
          : "#B7791F"
        : null;
  const budgetLabel = budget ? t(budget.tone === "over" ? "tripBudgetOver" : "tripBudgetLeft") : null;
  const budgetAmount = budget ? formatMoney(Math.abs(budget.left), currency) : null;
  const unpriced =
    forecast && forecast.unpriced > 0 ? t("tripUnpriced", { count: forecast.unpriced }) : null;
  const showForecast = Boolean(whole || budget);
  const estimate =
    soFar !== null
      ? t("tripEstimate", { amount: formatMoney(Math.round(shownSoFar * 1000) / 1000, currency) })
      : null;

  // Each part is measured on its own to give the slot in the list its height.
  const [baseHeight, setBaseHeight] = useState(0);
  const [forecastHeight, setForecastHeight] = useState(0);
  const [pendingHeight, setPendingHeight] = useState(0);
  const shownForecast = showForecast ? forecastHeight : 0;
  useEffect(() => {
    if (baseHeight <= 0) return;
    onNaturalHeight((CARD_PAD + CARD_BORDER) * 2 + baseHeight + shownForecast + pendingHeight);
  }, [baseHeight, onNaturalHeight, pendingHeight, shownForecast]);

  const cardStyle = useAnimatedStyle(() => {
    const ready = slotY.value >= 0;
    const natural = slotY.value - scrollY.value;
    return {
      opacity: ready ? 1 : 0,
      transform: [{ translateY: ready ? Math.max(pinTop, natural) : 0 }],
    };
  });
  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        { position: "absolute", top: 0, left: spacing.screen, right: spacing.screen, zIndex: 20 },
        cardStyle,
      ]}
    >
      <View
        ref={dockRef}
        collapsable={false}
        style={{
          overflow: "hidden",
          borderRadius: 24,
          borderWidth: CARD_BORDER,
          borderColor: withAlpha(dark ? colors.muted : colors.accentText, dark ? 0.22 : 0.18),
          // Same recipe as the tab bar: a tinted sheet over the blurred page.
          backgroundColor: withAlpha(dark ? colors.deep : colors.mist, dark ? 0.55 : 0.72),
        }}
      >
        <GlassFill soft screenBlur />
        <View style={{ padding: CARD_PAD }}>
          <View
            collapsable={false}
            onLayout={(event) => setBaseHeight(event.nativeEvent.layout.height)}
            accessible
            accessibilityLabel={[
              t("tripProgress", { done, total }),
              soFar !== null ? t("tripEstimate", { amount: formatMoney(soFar, currency) }) : null,
              whole ? `${t("tripWhole")} ${whole}` : null,
              budgetLabel ? `${budgetLabel} ${budgetAmount}` : null,
              showForecast ? unpriced : null,
            ]
              .filter(Boolean)
              .join(", ")}
          >
            <AppText className="text-base font-semibold text-cove-ink">
              {t("tripProgress", { done, total })}
            </AppText>
            {estimate ? (
              <View ref={estimateRef} collapsable={false} className="mt-1 flex-row">
                <Animated.View style={pulseStyle}>
                  <AppText className="text-sm text-cove-muted">{estimate}</AppText>
                </Animated.View>
              </View>
            ) : null}
            <View
              className="mt-3 h-2 overflow-hidden rounded-full"
              style={{ backgroundColor: withAlpha(colors.accentText, dark ? 0.22 : 0.18) }}
            >
              <Animated.View
                style={[
                  { height: "100%", borderRadius: 999, backgroundColor: colors.accent },
                  fillStyle,
                ]}
              />
            </View>
          </View>

          {showForecast ? (
            <View>
              <View
                collapsable={false}
                onLayout={(event) => setForecastHeight(event.nativeEvent.layout.height)}
                className="gap-1.5 pt-3"
              >
                {whole ? (
                  <View className="flex-row items-baseline justify-between gap-3">
                    <AppText className="min-w-0 flex-1 text-sm text-cove-muted">
                      {t("tripWhole")}
                    </AppText>
                    <AppText className="text-base font-semibold text-cove-ink">{whole}</AppText>
                  </View>
                ) : null}
                {budgetLabel ? (
                  <View className="flex-row items-baseline justify-between gap-3">
                    <AppText
                      className={`min-w-0 flex-1 text-sm ${budget?.tone === "over" ? "font-semibold" : ""}`}
                      style={{
                        color: budget?.tone === "over" ? (budgetColor ?? colors.muted) : colors.muted,
                      }}
                    >
                      {budgetLabel}
                    </AppText>
                    <AppText
                      className="text-base font-semibold"
                      style={{ color: budgetColor ?? colors.ink }}
                    >
                      {budgetAmount}
                    </AppText>
                  </View>
                ) : null}
                {unpriced ? <AppText className="text-xs text-cove-muted">{unpriced}</AppText> : null}
              </View>
            </View>
          ) : null}

          <View
            collapsable={false}
            onLayout={(event) => setPendingHeight(event.nativeEvent.layout.height)}
          >
            <PendingPrices
              pending={pending}
              open={pendingOpen}
              currency={currency}
              onToggle={onTogglePending}
              onSave={onSavePrice}
              onSkip={onSkipPrice}
            />
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

function PendingPrices({
  pending,
  open,
  currency,
  onToggle,
  onSave,
  onSkip,
}: {
  pending: PendingPrice[];
  open: boolean;
  currency: string;
  onToggle: () => void;
  onSave: (id: string, cost: number, from: Rect) => void;
  onSkip: (id: string) => void;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  if (pending.length === 0) return null;
  // One item shows its price straight away; more fold behind the arrow.
  const single = pending.length === 1;
  const summary = t("tripPricesWaiting", { count: pending.length });

  return (
    <View className="gap-2 pt-3">
      {single ? null : (
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync();
            onToggle();
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${summary}. ${t(open ? "tripPricesHide" : "tripPricesShow")}`}
          hitSlop={6}
          className="flex-row items-center gap-3 active:opacity-80"
        >
          <AppText className="min-w-0 flex-1 text-sm font-semibold text-cove-ink">{summary}</AppText>
          <View
            className="h-7 w-7 items-center justify-center rounded-full"
            style={{
              backgroundColor: withAlpha(colors.accentText, scheme === "dark" ? 0.22 : 0.16),
            }}
          >
            <Ionicons
              name={open ? "chevron-up" : "chevron-down"}
              size={16}
              color={colors.accentText}
            />
          </View>
        </Pressable>
      )}
      {single || open
        ? pending.map((entry) => (
            <PriceLine
              key={entry.id}
              entry={entry}
              currency={currency}
              onSave={onSave}
              onSkip={onSkip}
            />
          ))
        : null}
    </View>
  );
}

function PriceLine({
  entry,
  currency,
  onSave,
  onSkip,
}: {
  entry: PendingPrice;
  currency: string;
  onSave: (id: string, cost: number, from: Rect) => void;
  onSkip: (id: string) => void;
}) {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const { scale } = useFontScale();
  const dark = scheme === "dark";
  const danger = dark ? "#F07178" : "#C2414A";
  const [value, setValue] = useState(() =>
    entry.remembered !== null ? formatCostInput(entry.remembered, currency) : "",
  );
  const [invalid, setInvalid] = useState(false);
  const fieldRef = useRef<ViewHandle>(null);

  function save() {
    const parsed = parseCostInput(value);
    if (parsed !== null && Number.isNaN(parsed)) {
      setInvalid(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    // An empty field is "no price", the same as Skip.
    if (parsed === null) {
      onSkip(entry.id);
      return;
    }
    void Haptics.selectionAsync();
    const field = fieldRef.current;
    if (!field) {
      onSave(entry.id, parsed, { x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    field.measureInWindow((x, y, width, height) => onSave(entry.id, parsed, { x, y, width, height }));
  }

  return (
    <Animated.View entering={FadeIn.duration(220)} className="flex-row items-center gap-2">
      <AppText numberOfLines={1} className="min-w-0 flex-1 text-sm font-semibold text-cove-ink">
        {entry.name}
      </AppText>
      <View
        ref={fieldRef}
        collapsable={false}
        className="h-10 flex-row items-center gap-1.5 rounded-2xl px-2.5"
        style={{
          backgroundColor: dark ? withAlpha(colors.white, 0.08) : withAlpha(colors.white, 0.85),
          borderWidth: 1,
          borderColor: invalid ? danger : "transparent",
        }}
      >
        <AppText className="text-xs font-semibold" style={{ color: colors.accentText }}>
          {currencySymbol(currency)}
        </AppText>
        <TextInput
          value={value}
          onChangeText={(text) => {
            setValue(text);
            setInvalid(false);
          }}
          placeholder={caretGap(t("costPlaceholder"))}
          {...caretColors(colors.accentText)}
          placeholderTextColor={withAlpha(colors.muted, 0.55)}
          keyboardType="decimal-pad"
          returnKeyType="done"
          selectTextOnFocus
          onSubmitEditing={save}
          accessibilityLabel={t("tripPriceFor", { name: entry.name })}
          textAlign={isRTL ? "right" : "left"}
          textAlignVertical="center"
          allowFontScaling={false}
          style={[
            singleLineInput,
            {
              minWidth: 62,
              maxWidth: 96,
              fontFamily: appFont.semibold,
              fontSize: scaleFontSize(15, scale),
              color: colors.ink,
            },
          ]}
        />
      </View>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onSkip(entry.id);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${t("skipCost")}, ${entry.name}`}
        hitSlop={6}
        className="h-10 justify-center px-1 active:opacity-70"
      >
        <AppText className="text-sm font-semibold" style={{ color: colors.accentText }}>
          {t("skipCost")}
        </AppText>
      </Pressable>
      <Pressable
        onPress={save}
        accessibilityRole="button"
        accessibilityLabel={`${t("tripPriceSave")}, ${entry.name}`}
        hitSlop={4}
        className="active:opacity-80"
      >
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.accentText }}
        >
          <Ionicons name="checkmark" size={20} color={colors.onAccent} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Something on its way to the trip card: a bought row, or a saved price. */
export type Flight = {
  key: string;
  kind: "row" | "price";
  label: string;
  from: Rect;
  toX: number;
  toY: number;
};

const ROW_FLIGHT_MS = 480;
const PRICE_FLIGHT_MS = 420;

/** Plays one flight, then asks to be removed. Coordinates are the overlay's own. */
export function Flyer({ flight, onDone }: { flight: Flight; onDone: (key: string) => void }) {
  const { colors, scheme } = useTheme();
  const row = flight.kind === "row";
  const travel = useSharedValue(0);
  const { key } = flight;
  useEffect(() => {
    travel.value = withTiming(
      1,
      {
        duration: row ? ROW_FLIGHT_MS : PRICE_FLIGHT_MS,
        easing: row ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic),
      },
      () => runOnJS(onDone)(key),
    );
  }, [key, onDone, row, travel]);

  const dx = flight.toX - flight.from.x;
  const dy = flight.toY - flight.from.y;
  const endScale = row ? 0.9 : 0.6;
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(travel.value, [0, 0.75, 1], [1, 1, 0], Extrapolation.CLAMP),
    transform: [
      { translateX: dx * travel.value },
      { translateY: dy * travel.value },
      { scale: 1 + (endScale - 1) * travel.value },
    ],
  }));
  const shadow = {
    shadowColor: scheme === "dark" ? "#000000" : colors.ink,
    shadowOpacity: scheme === "dark" ? 0.4 : 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  };

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          left: flight.from.x,
          top: flight.from.y,
          zIndex: 30,
          backgroundColor: colors.paper,
        },
        row
          ? {
              width: flight.from.width,
              minHeight: flight.from.height,
              borderRadius: 24,
              paddingHorizontal: 16,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }
          : { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
        shadow,
        style,
      ]}
    >
      {row ? (
        <View
          className="h-6 w-6 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.accent }}
        >
          <Ionicons name="checkmark" size={16} color={colors.onAccent} />
        </View>
      ) : null}
      <AppText
        numberOfLines={1}
        className={
          row
            ? "min-w-0 flex-1 text-base font-semibold text-cove-ink"
            : "text-xs font-semibold text-cove-ink"
        }
      >
        {flight.label}
      </AppText>
    </Animated.View>
  );
}
