import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { getCategoryLabel } from "@/constants/categories";
import { tabBar, withAlpha } from "@/constants/theme";
import {
  Chip,
  ITEM_UNITS,
  useUnitLabel,
} from "@/features/items/components/item-sheet-form";
import { useCategories } from "@/features/items/providers/categories-provider";
import type { PurchaseCategory } from "@/features/items/types/purchase";
import { KEEP_MOTION } from "@/lib/motion";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

export type SelectionAction =
  | "bought"
  | "pin"
  | "urgent"
  | "later"
  | "delete"
  | "move"
  | "category"
  | "unit";

type SelectionBarProps = {
  /** The action being saved right now: its button shows a spinner. */
  busyAction: SelectionAction | null;
  disabled: boolean;
  /** Every selected item is urgent, so the button clears it instead. */
  clearUrgent: boolean;
  canMove: boolean;
  /** Nothing is left to add to the selection. */
  allSelected: boolean;
  /** What the selected items have in common; undefined when they differ. */
  category: PurchaseCategory | undefined;
  /** "" = plain pieces; undefined when the selected items differ. */
  unit: string | undefined;
  onBought: () => void;
  onPin: () => void;
  onUrgent: () => void;
  onDelete: () => void;
  onMove: () => void;
  /** Park the selection on the Later shelf. */
  onLater: () => void;
  /** Save the selection as a set. */
  onSaveSet: () => void;
  onSelectAll: () => void;
  onSetCategory: (category: PurchaseCategory) => void;
  onSetUnit: (unit: string) => void;
};

type ActionCell = {
  key: string;
  label: string;
  icon: ReactNode;
  color: string;
  busy?: boolean;
  locked?: boolean;
  onPress: () => void;
};

type PageIndex = 0 | 1;
type Picker = "category" | "unit";

const DANGER = "#F87171";
const PAGE_MS = 260;
/** A flick this fast turns the page even if it was short. */
const FLICK_VELOCITY = 500;

/**
 * The dock shown while items are selected. Two pages of actions (swipe, or tap
 * the arrow); Category and Unit swap the bar for a row of choices.
 */
export function SelectionBar({
  busyAction,
  disabled,
  clearUrgent,
  canMove,
  allSelected,
  category,
  unit,
  onBought,
  onPin,
  onUrgent,
  onDelete,
  onMove,
  onLater,
  onSaveSet,
  onSelectAll,
  onSetCategory,
  onSetUnit,
}: SelectionBarProps) {
  const { colors, scheme, shadow } = useTheme();
  const { t, isRTL, locale } = useI18n();
  const { categories } = useCategories();
  const unitLabel = useUnitLabel();
  const [page, setPage] = useState<PageIndex>(0);
  const [picker, setPicker] = useState<Picker | null>(null);
  const dark = scheme === "dark";
  const ink = colors.ink;

  // Android back steps out of the choices before it ends the selection.
  useEffect(() => {
    if (!picker) return;
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      setPicker(null);
      return true;
    });
    return () => subscription.remove();
  }, [picker]);

  const mainActions: ActionCell[] = [
    {
      key: "bought",
      label: t("markSelectedBought"),
      icon: <MaterialCommunityIcons name="cart-check" size={20} color={ink} />,
      color: ink,
      busy: busyAction === "bought",
      onPress: onBought,
    },
    {
      key: "pin",
      label: t("pinSelected"),
      icon: (
        <View style={{ transform: [{ rotate: isRTL ? "28deg" : "-28deg" }] }}>
          <MaterialCommunityIcons name="pin" size={18} color={ink} />
        </View>
      ),
      color: ink,
      busy: busyAction === "pin",
      onPress: onPin,
    },
    {
      key: "urgent",
      label: clearUrgent ? t("clearSelectedUrgent") : t("markSelectedUrgent"),
      icon: clearUrgent ? (
        <>
          <Ionicons name="flash" size={18} color={DANGER} style={{ opacity: 0.45 }} />
          <View
            pointerEvents="none"
            style={[styles.strike, { backgroundColor: DANGER }]}
          />
        </>
      ) : (
        <Ionicons name="flash" size={18} color={DANGER} />
      ),
      color: DANGER,
      busy: busyAction === "urgent",
      onPress: onUrgent,
    },
    {
      key: "later",
      label: t("laterAction"),
      icon: <Ionicons name="hourglass-outline" size={18} color={ink} />,
      color: ink,
      busy: busyAction === "later",
      onPress: onLater,
    },
    {
      key: "delete",
      label: t("delete"),
      icon: <Ionicons name="trash-outline" size={18} color={DANGER} />,
      color: DANGER,
      busy: busyAction === "delete",
      onPress: onDelete,
    },
  ];

  const moreActions: ActionCell[] = [
    {
      key: "move",
      label: t("moveSelected"),
      icon: <Ionicons name="swap-horizontal" size={18} color={ink} />,
      color: ink,
      busy: busyAction === "move",
      locked: !canMove,
      onPress: onMove,
    },
    {
      key: "category",
      label: t("category"),
      icon: <Ionicons name="grid-outline" size={18} color={ink} />,
      color: ink,
      onPress: () => setPicker("category"),
    },
    {
      key: "unit",
      label: t("unit"),
      icon: <MaterialCommunityIcons name="scale-balance" size={19} color={ink} />,
      color: ink,
      onPress: () => setPicker("unit"),
    },
    {
      key: "set",
      label: t("saveAsSet"),
      icon: <MaterialCommunityIcons name="card-multiple-outline" size={19} color={ink} />,
      color: ink,
      onPress: onSaveSet,
    },
    {
      key: "selectAll",
      label: t("selectAll"),
      icon: <Ionicons name="checkmark-done" size={19} color={ink} />,
      color: ink,
      locked: allSelected,
      onPress: onSelectAll,
    },
  ];

  // "Other" is the catch-all, so it goes last (as in the category filter).
  const orderedCategories = [...categories].sort((a, b) =>
    a.id === "other" ? 1 : b.id === "other" ? -1 : 0,
  );
  // A custom unit the items already share is offered too, so it can be seen.
  const knownUnits: readonly string[] = ITEM_UNITS;
  const units =
    unit !== undefined && !knownUnits.includes(unit)
      ? [unit, ...knownUnits]
      : knownUnits;

  /** Tapping the choice the items already have just goes back. */
  function choose<T>(value: T, current: T | undefined, apply: (value: T) => void) {
    void Haptics.selectionAsync();
    if (value === current) setPicker(null);
    else apply(value);
  }

  return (
    <View
      style={{
        shadowColor: shadow.color,
        shadowOffset: shadow.offset,
        shadowOpacity: dark ? 0.42 : 0.16,
        shadowRadius: 24,
        elevation: shadow.elevation,
      }}
    >
      <View
        style={[
          styles.shell,
          {
            borderColor: withAlpha(dark ? colors.muted : colors.accentText, 0.34),
            backgroundColor: withAlpha(
              dark ? colors.deep : colors.mist,
              dark ? 0.55 : 0.72,
            ),
          },
        ]}
      >
        <GlassFill soft screenBlur />
        <View style={styles.body}>
          {picker === "category" ? (
            <ChoiceRow
              busy={busyAction === "category"}
              disabled={disabled}
              onBack={() => setPicker(null)}
            >
              {orderedCategories.map((entry) => (
                <Chip
                  key={entry.id}
                  compact
                  label={
                    entry.builtin
                      ? getCategoryLabel(entry.id, locale)
                      : (entry.name ?? entry.id)
                  }
                  selected={entry.id === category}
                  onPress={() => choose(entry.id, category, onSetCategory)}
                />
              ))}
            </ChoiceRow>
          ) : picker === "unit" ? (
            <ChoiceRow
              busy={busyAction === "unit"}
              disabled={disabled}
              onBack={() => setPicker(null)}
            >
              {units.map((value) => (
                <Chip
                  key={value || "pcs"}
                  compact
                  label={unitLabel(value)}
                  selected={value === unit}
                  onPress={() => choose(value, unit, onSetUnit)}
                />
              ))}
            </ChoiceRow>
          ) : (
            <ActionPager
              page={page}
              onChangePage={setPage}
              disabled={disabled}
              pages={[mainActions, moreActions]}
            />
          )}
        </View>
      </View>
    </View>
  );
}

/** Two pages of actions side by side; the arrow at the edge leads to the other. */
function ActionPager({
  page,
  onChangePage,
  disabled,
  pages,
}: {
  page: PageIndex;
  onChangePage: (page: PageIndex) => void;
  disabled: boolean;
  pages: [ActionCell[], ActionCell[]];
}) {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  // The next page lies to the right in English and to the left in Arabic.
  const direction = isRTL ? -1 : 1;
  const width = useSharedValue(0);
  /** 0 = first page, 1 = second page, in between while turning. */
  const progress = useSharedValue<number>(page);
  const dragStart = useSharedValue<number>(page);
  const hint = useSharedValue(0);

  // A small nudge on the arrow says there is a second page.
  useEffect(() => {
    hint.set(
      withDelay(
        500,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 320 }),
            withTiming(0, { duration: 320 }),
          ),
          3,
          false,
          undefined,
          // The nudge is the only sign of a second page, so it stays with animations off.
          KEEP_MOTION,
        ),
        KEEP_MOTION,
      ),
    );
  }, [hint]);

  function turnTo(next: PageIndex) {
    void Haptics.selectionAsync();
    onChangePage(next);
    progress.set(withTiming(next, { duration: PAGE_MS, easing: Easing.out(Easing.cubic) }));
  }

  const settle = (next: number) => onChangePage(next >= 0.5 ? 1 : 0);

  const pan = usePanGesture({
    enabled: !disabled,
    activeOffsetX: [-12, 12],
    failOffsetY: [-12, 12],
    onActivate: () => {
      dragStart.set(progress.value);
    },
    onUpdate: (event) => {
      const span = Math.max(width.value, 1);
      const next = dragStart.value - (event.translationX * direction) / span;
      progress.set(Math.min(1, Math.max(0, next)));
    },
    onDeactivate: (event) => {
      const forward = -event.velocityX * direction;
      const target = event.canceled
        ? Math.round(dragStart.value)
        : Math.abs(forward) >= FLICK_VELOCITY
          ? forward > 0
            ? 1
            : 0
          : Math.round(progress.value);
      progress.set(withTiming(target, { duration: PAGE_MS, easing: Easing.out(Easing.cubic) }));
      runOnJS(settle)(target);
    },
  });

  const firstStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [{ translateX: -direction * progress.value * width.value }],
  }));
  const secondStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: direction * (1 - progress.value) * width.value }],
  }));
  const hintStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: direction * hint.value * 4 }],
  }));

  const forwardIcon = isRTL ? "chevron-back" : "chevron-forward";
  const backIcon = isRTL ? "chevron-forward" : "chevron-back";

  function arrow(label: string, icon: typeof forwardIcon, target: PageIndex) {
    return (
      <Pressable
        disabled={disabled}
        onPress={() => turnTo(target)}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        hitSlop={4}
        style={[styles.arrow, { opacity: disabled ? 0.5 : 1 }]}
      >
        <Ionicons name={icon} size={18} color={colors.ink} />
      </Pressable>
    );
  }

  /** The page out of view takes no taps and is skipped by screen readers. */
  function pageProps(index: PageIndex) {
    const shown = page === index;
    return {
      pointerEvents: shown ? ("auto" as const) : ("none" as const),
      accessibilityElementsHidden: !shown,
      importantForAccessibility: shown
        ? ("auto" as const)
        : ("no-hide-descendants" as const),
    };
  }

  return (
    <GestureDetector gesture={pan}>
      <View
        style={styles.pager}
        onLayout={(event) => width.set(event.nativeEvent.layout.width)}
      >
        <Animated.View style={[styles.page, firstStyle]} {...pageProps(0)}>
          {pages[0].map((cell) => (
            <ActionButton key={cell.key} cell={cell} disabled={disabled} />
          ))}
          <Animated.View style={hintStyle}>
            {arrow(t("moreActions"), forwardIcon, 1)}
          </Animated.View>
        </Animated.View>
        <Animated.View style={[styles.page, secondStyle]} {...pageProps(1)}>
          {arrow(t("mainActions"), backIcon, 0)}
          {pages[1].map((cell) => (
            <ActionButton key={cell.key} cell={cell} disabled={disabled} />
          ))}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

function ActionButton({ cell, disabled }: { cell: ActionCell; disabled: boolean }) {
  const inactive = disabled || cell.locked === true;
  return (
    <Pressable
      disabled={inactive}
      onPress={cell.onPress}
      accessibilityRole="button"
      accessibilityLabel={cell.label}
      accessibilityState={{ disabled: inactive, busy: cell.busy === true }}
      style={[styles.cell, { opacity: inactive ? 0.5 : 1 }]}
    >
      {cell.busy ? (
        <ActivityIndicator color={cell.color} />
      ) : (
        <>
          <View style={styles.iconSlot}>{cell.icon}</View>
          <AppText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            style={[styles.label, { color: cell.color }]}
          >
            {cell.label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

/** A back button and one scrolling row of choices, in place of the actions. */
function ChoiceRow({
  busy,
  disabled,
  onBack,
  children,
}: {
  busy: boolean;
  disabled: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const { t, isRTL } = useI18n();
  const motionOff = useMotionOff();
  return (
    <Animated.View
      entering={motionOff ? undefined : FadeIn.duration(180)}
      style={styles.choices}
    >
      <Pressable
        disabled={disabled}
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t("back")}
        accessibilityState={{ disabled, busy }}
        hitSlop={4}
        style={[
          styles.back,
          {
            backgroundColor:
              scheme === "dark" ? withAlpha(colors.white, 0.1) : colors.white,
          },
        ]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.accentText} />
        ) : (
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={20}
            color={colors.ink}
          />
        )}
      </Pressable>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        pointerEvents={disabled ? "none" : "auto"}
        style={{ opacity: disabled ? 0.5 : 1 }}
        contentContainerStyle={styles.chips}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: tabBar.height,
    borderRadius: tabBar.radius,
    borderWidth: tabBar.borderWidth,
    overflow: "hidden",
  },
  body: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    padding: 6,
  },
  pager: {
    flex: 1,
    overflow: "hidden",
    borderRadius: tabBar.radius - 6,
  },
  page: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 4,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  iconSlot: {
    height: 22,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: tabBar.labelSize,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: tabBar.labelSize + 2,
    width: "100%",
  },
  strike: {
    position: "absolute",
    width: 20,
    height: 2.5,
    borderRadius: 2,
    transform: [{ rotate: "-38deg" }],
  },
  arrow: {
    width: 32,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  choices: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginStart: 4,
  },
  chips: {
    alignItems: "center",
    gap: 8,
    paddingEnd: 12,
  },
});
