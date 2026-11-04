import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  Extrapolation,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { useSetTabBarCenter } from "@/components/ui/TabBarVisibility";
import { firstName } from "@/features/items/api/shop-locks";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const FAB_SIZE = 56;
const FAB_RING = 0;
/** How far the button's bottom sits above the bar's bottom edge. */
const FAB_LIFT = 24;
/** Swipe on the + further / faster than this to open or close the menu. */
const SWIPE_DISTANCE = 28;
const SWIPE_VELOCITY = 600;
const MAX_ARROW_LIFT = 14;
const MENU_IN_MS = 220;
const MENU_OUT_MS = 180;
/** Share of the timeline each pill is offset by (stagger). */
const MENU_STAGGER = 0.25;

/** Row with the arrow and the shop count chip beside it. */
const ARROW_ROW_WIDTH = 104;
const ARROW_ROW_HEIGHT = 30;
const COUNT_CHIP_HEIGHT = 24;
/** Shop count shown in place of the arrow for a moment on each visit. */
const COUNT_FLASH_DELAY_MS = 400;
const COUNT_FLASH_HOLD_MS = 2000;

/** One-time swipe hint (C). */
const HINT_KEY = "omt.hint.itemsFabSwipe";
const HINT_DELAY_MS = 900;
const HINT_WIDTH = 240;

function readHintSeen() {
  try {
    return globalThis.localStorage?.getItem(HINT_KEY) === "1";
  } catch {
    return true;
  }
}

function writeHintSeen() {
  try {
    globalThis.localStorage?.setItem(HINT_KEY, "1");
  } catch {
    // Storage unavailable: the hint may show again next launch, harmless.
  }
}

type Props = {
  onAdd: () => void;
  onPins: () => void;
  shopCount: number;
  shopDisabled: boolean;
  shopLockedByName?: string | null;
  onShop: () => void;
};

/**
 * Raised add button in the middle of the tab bar (between History and Home),
 * with a bare arrow above it that reveals Pinned and Shop.
 *
 * The button is drawn by GlassTabBar (via the center slot) so it sits on top
 * of the bar; this component only owns the open state and the screen dim.
 */
export function ItemsFab(props: Props) {
  const { scheme } = useTheme();
  const { t } = useI18n();
  const setCenter = useSetTabBarCenter();
  const focused = useIsFocused();
  const [open, setOpen] = useState(false);
  const dark = scheme === "dark";

  // C: teach the swipe once, a moment after Items first opens.
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  const [hintReady, setHintReady] = useState(false);
  useEffect(() => {
    if (hintSeen || !focused) return;
    const timer = setTimeout(() => setHintReady(true), HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [focused, hintSeen]);
  const hint = hintReady && !hintSeen && focused && !open;
  function dismissHint() {
    if (hintSeen) return;
    writeHintSeen();
    setHintSeen(true);
  }

  useEffect(() => {
    if (!focused) {
      setCenter(null);
      return;
    }
    setCenter(
      <ItemsFabCluster
        {...props}
        open={open}
        hint={hint}
        onDismissHint={dismissHint}
        onToggle={() => {
          void Haptics.selectionAsync();
          dismissHint();
          setOpen((value) => !value);
        }}
        onClose={() => setOpen(false)}
      />,
    );
  });

  useEffect(() => () => setCenter(null), [setCenter]);

  // Close the menu when leaving the tab (state adjusted during render).
  const [wasFocused, setWasFocused] = useState(focused);
  if (focused !== wasFocused) {
    setWasFocused(focused);
    if (!focused) setOpen(false);
  }

  if (!open && !hint) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(hint ? 260 : 160)}
      exiting={FadeOut.duration(MENU_OUT_MS)}
      style={[StyleSheet.absoluteFill, { zIndex: 25 }]}
    >
      <Pressable
        onPress={() => (hint ? dismissHint() : setOpen(false))}
        accessibilityRole="button"
        accessibilityLabel={t("close")}
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: withAlpha("#000000", hint ? (dark ? 0.62 : 0.45) : dark ? 0.5 : 0.28) },
        ]}
      />
    </Animated.View>
  );
}

function ItemsFabCluster({
  onAdd,
  onPins,
  shopCount,
  shopDisabled,
  shopLockedByName,
  onShop,
  open,
  hint,
  onDismissHint,
  onToggle,
  onClose,
}: Props & {
  open: boolean;
  hint: boolean;
  onDismissHint: () => void;
  onToggle: () => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const turn = useSharedValue(open ? 1 : 0);
  // Arrow follows a swipe on the + a little, as a hint of what it does.
  const lift = useSharedValue(0);
  useEffect(() => {
    turn.set(withTiming(open ? 1 : 0, { duration: 180 }));
  }, [open, turn]);
  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lift.value }, { rotate: `${turn.value * 180}deg` }],
  }));

  // Menu open/close is driven by one value so pills keep their layout while
  // animating out (layout exit animations made them jump onto the +), and
  // they unmount only after the close finishes.
  const [menuMounted, setMenuMounted] = useState(open);
  if (open && !menuMounted) setMenuMounted(true);
  const menu = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    if (open) {
      menu.set(withTiming(1, { duration: MENU_IN_MS, easing: Easing.out(Easing.cubic) }));
      return;
    }
    menu.set(
      withTiming(0, { duration: MENU_OUT_MS, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(setMenuMounted)(false);
      }),
    );
  }, [menu, open]);

  // B: on each visit to Items, if there's something to shop, the arrow
  // briefly turns into a "cart · N" chip, then back. (This cluster mounts when
  // the Items tab is focused, so "once per mount" = once per visit.)
  const shopCountVisible = !shopDisabled && !shopLockedByName && shopCount > 0;
  const flash = useSharedValue(0);
  const pulse = useSharedValue(0);
  const flashed = useRef(false);
  useEffect(() => {
    if (open) {
      flash.set(withTiming(0, { duration: 120 }));
      return;
    }
    if (flashed.current || !shopCountVisible || hint) return;
    flashed.current = true;
    // Ring blinks twice as the chip appears.
    pulse.set(0);
    pulse.set(
      withDelay(
        COUNT_FLASH_DELAY_MS + 120,
        withRepeat(withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }), 2, false),
      ),
    );
    flash.set(
      withSequence(
        withDelay(COUNT_FLASH_DELAY_MS, withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) })),
        withDelay(COUNT_FLASH_HOLD_MS, withTiming(0, { duration: 320, easing: Easing.in(Easing.cubic) })),
      ),
    );
  }, [flash, hint, open, pulse, shopCountVisible]);
  const pulseStyle = useAnimatedStyle(() => {
    const active = pulse.value > 0 && pulse.value < 1;
    return {
      opacity: active ? (1 - pulse.value) * 0.8 : 0,
      transform: [{ scaleX: 1 + pulse.value * 0.35 }, { scaleY: 1 + pulse.value * 0.6 }],
    };
  });
  const arrowFadeStyle = useAnimatedStyle(() => ({ opacity: 1 - flash.value }));
  const countStyle = useAnimatedStyle(() => ({
    opacity: flash.value * (1 - menu.value),
    transform: [{ scale: 0.85 + flash.value * 0.15 }],
  }));

  // C: animated hand sliding up from the + toward the arrow.
  const hand = useSharedValue(0);
  useEffect(() => {
    if (!hint) {
      hand.set(0);
      return;
    }
    hand.set(
      withRepeat(
        withSequence(
          withTiming(0, { duration: 0 }),
          withDelay(250, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) })),
          withDelay(200, withTiming(1, { duration: 0 })),
        ),
        -1,
        false,
      ),
    );
  }, [hand, hint]);
  const handStyle = useAnimatedStyle(() => ({
    opacity: hand.value < 0.85 ? 1 : (1 - hand.value) / 0.15,
    transform: [{ translateY: -hand.value * 46 }],
  }));

  // Swipe up on the + opens Pinned / Shop (same as the arrow); swipe down
  // closes. A plain tap still adds an item.
  const latest = useRef({ open, onToggle, onClose, onDismissHint });
  useEffect(() => {
    latest.current = { open, onToggle, onClose, onDismissHint };
  });
  function swiped(direction: "up" | "down") {
    const { open: isOpen, onToggle: toggle, onClose: close, onDismissHint: dismiss } = latest.current;
    dismiss();
    if (direction === "up" && !isOpen) toggle();
    if (direction === "down" && isOpen) close();
  }
  const swipe = usePanGesture({
    activeOffsetY: [-12, 12],
    failOffsetX: [-24, 24],
    onUpdate: (event) => {
      lift.set(Math.max(-MAX_ARROW_LIFT, Math.min(0, event.translationY * 0.35)));
    },
    onDeactivate: (event) => {
      lift.set(withSpring(0, { damping: 16, stiffness: 260 }));
      if (event.translationY < -SWIPE_DISTANCE || event.velocityY < -SWIPE_VELOCITY) {
        runOnJS(swiped)("up");
      } else if (event.translationY > SWIPE_DISTANCE || event.velocityY > SWIPE_VELOCITY) {
        runOnJS(swiped)("down");
      }
    },
    onFinalize: () => {
      lift.set(withSpring(0, { damping: 16, stiffness: 260 }));
    },
  });

  const shopLocked = Boolean(shopLockedByName);
  const shopper = firstName(shopLockedByName);
  const shopLabel = shopLocked
    ? shopper
      ? t("shopLockedBy", { name: shopper })
      : t("shopLocked")
    : t("shop");

  function run(action: () => void) {
    onClose();
    action();
  }

  return (
    <View pointerEvents="box-none" style={styles.cluster}>
      {menuMounted ? (
        <View pointerEvents={open ? "box-none" : "none"} style={styles.menu}>
          <MiniAction
            progress={menu}
            index={1}
            icon="cart"
            label={shopLabel}
            badge={shopLocked || shopCount === 0 ? null : shopCount}
            disabled={shopDisabled}
            muted={shopLocked}
            onPress={() => run(onShop)}
          />
          <MiniAction
            progress={menu}
            index={0}
            icon="pin"
            label={t("pin")}
            onPress={() => run(onPins)}
          />
        </View>
      ) : null}

      {hint ? (
        <View pointerEvents="none" style={styles.hintWrap}>
          <Animated.View entering={FadeIn.duration(260)} style={styles.hintInner}>
            <View style={[styles.hintBubble, { backgroundColor: colors.accent }]}>
              <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                {t("fabSwipeHint")}
              </AppText>
            </View>
            <View style={[styles.hintCaret, { borderTopColor: colors.accent }]} />
            <View style={styles.hintGhosts}>
              <GhostPill icon="cart" label={t("shop")} />
              <GhostPill icon="pin" label={t("pin")} />
            </View>
          </Animated.View>
        </View>
      ) : null}

      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={open ? t("close") : t("moreActions")}
        accessibilityState={{ expanded: open }}
        hitSlop={{ top: 6, bottom: 2 }}
        className="active:opacity-60"
        style={styles.arrowRow}
      >
        <Animated.View style={[arrowStyle, arrowFadeStyle]}>
          <Ionicons
            name="chevron-up"
            size={22}
            color={colors.ink}
            style={styles.arrowGlyph}
          />
        </Animated.View>
        {shopCountVisible ? (
          // Sits exactly where the arrow is, shown briefly on visit.
          <Animated.View pointerEvents="none" style={[styles.countSlot, countStyle]}>
            <View
              style={[
                styles.countChip,
                { borderColor: withAlpha(colors.accent, 0.7), backgroundColor: colors.paper },
              ]}
            >
              <Animated.View
                pointerEvents="none"
                style={[styles.countPulse, { borderColor: colors.accent }, pulseStyle]}
              />
              <MaterialCommunityIcons name="cart" size={13} color={colors.accent} />
              <AppText className="text-xs font-bold" style={{ color: colors.ink }}>
                {shopCount > 99 ? "99+" : shopCount}
              </AppText>
            </View>
          </Animated.View>
        ) : null}
      </Pressable>

      <GestureDetector gesture={swipe}>
      <Pressable
        onPress={() => {
          onDismissHint();
          run(onAdd);
        }}
        accessibilityRole="button"
        accessibilityLabel={t("addItemDetails")}
        accessibilityHint={t("moreActions")}
        className="active:opacity-85"
        style={styles.fabRing}
      >
        <View
          className="items-center justify-center overflow-hidden"
          style={[styles.fab, { backgroundColor: colors.accent }]}
        >
          <LinearGradient
            colors={[withAlpha("#ffffff", 0.3), withAlpha("#ffffff", 0)]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 0.75 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="add" size={30} color={colors.onAccent} />
        </View>
        {hint ? (
          <Animated.View pointerEvents="none" style={[styles.hand, handStyle]}>
            <MaterialCommunityIcons
              name="gesture-swipe-up"
              size={34}
              color="#FFFFFF"
              style={styles.handGlyph}
            />
          </Animated.View>
        ) : null}
      </Pressable>
      </GestureDetector>
    </View>
  );
}

/** Faded, dashed preview of a menu pill for the one-time hint. */
function GhostPill({
  icon,
  label,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-center gap-2 rounded-full"
      style={[
        styles.pill,
        {
          opacity: 0.75,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: withAlpha(colors.accent, 0.8),
          backgroundColor: withAlpha(colors.paper, 0.85),
        },
      ]}
    >
      <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
      <AppText numberOfLines={1} className="text-sm font-semibold" style={{ color: colors.ink }}>
        {label}
      </AppText>
    </View>
  );
}

function MiniAction({
  progress,
  index,
  icon,
  label,
  badge = null,
  disabled = false,
  muted = false,
  onPress,
}: {
  progress: SharedValue<number>;
  /** 0 = closest to the +. Opens bottom-up and closes top-down. */
  index: number;
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  badge?: number | null;
  disabled?: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const inactive = disabled || muted;
  // Each pill animates over its own slice of the shared timeline; higher
  // pills start later on open, so on close (reverse) they leave first.
  const start = index * MENU_STAGGER;
  const pillStyle = useAnimatedStyle(() => {
    const local = interpolate(
      progress.value,
      [start, start + (1 - MENU_STAGGER)],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return {
      opacity: local,
      transform: [{ translateY: (1 - local) * 14 }, { scale: 0.92 + local * 0.08 }],
    };
  });

  return (
    <Animated.View style={[styles.lift, { borderRadius: 999 }, pillStyle]}>
      <Pressable
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        className={`flex-row items-center gap-2 overflow-hidden rounded-full ${disabled ? "" : "active:opacity-70"}`}
        style={[
          styles.pill,
          {
            opacity: inactive ? 0.55 : 1,
            borderWidth: 1,
            borderColor: withAlpha(dark ? colors.muted : colors.accent, dark ? 0.4 : 0.34),
            backgroundColor: withAlpha(dark ? colors.deep : colors.mist, dark ? 0.72 : 0.82),
          },
        ]}
      >
        <GlassFill soft screenBlur />
        <MaterialCommunityIcons name={icon} size={18} color={colors.accent} />
        <AppText numberOfLines={1} className="text-sm font-semibold" style={{ color: colors.ink }}>
          {label}
        </AppText>
        {badge !== null ? (
          <View style={[styles.badge, { backgroundColor: colors.accent }]}>
            <AppText className="text-[11px] font-bold" style={{ color: colors.onAccent }}>
              {badge > 99 ? "99+" : badge}
            </AppText>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const RING_SIZE = FAB_SIZE + FAB_RING * 2;

const styles = StyleSheet.create({
  cluster: {
    alignItems: "center",
    // Ring bottom sits FAB_LIFT above the bar's bottom, so the button pokes
    // up past the bar's top edge.
    paddingBottom: FAB_LIFT - FAB_RING,
  },
  menu: {
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  arrowRow: {
    width: ARROW_ROW_WIDTH,
    height: ARROW_ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  countSlot: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  countPulse: {
    position: "absolute",
    top: -3,
    bottom: -3,
    left: -3,
    right: -3,
    borderRadius: COUNT_CHIP_HEIGHT,
    borderWidth: 1.5,
  },
  countChip: {
    height: COUNT_CHIP_HEIGHT,
    paddingHorizontal: 9,
    borderRadius: COUNT_CHIP_HEIGHT / 2,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  hintWrap: {
    position: "absolute",
    bottom: FAB_LIFT - FAB_RING + RING_SIZE + ARROW_ROW_HEIGHT + 6,
    left: "50%",
    width: HINT_WIDTH,
    transform: [{ translateX: -HINT_WIDTH / 2 }],
    alignItems: "center",
  },
  hintInner: {
    alignItems: "center",
  },
  hintBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
  },
  hintCaret: {
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginBottom: 10,
  },
  hintGhosts: {
    alignItems: "center",
    gap: 8,
  },
  hand: {
    position: "absolute",
    end: -18,
    bottom: -6,
  },
  handGlyph: {
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  arrowGlyph: {
    textShadowColor: "rgba(0,0,0,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  fabRing: {
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    // Android draws elevation only on views with a background.
    elevation: 8,
  },
  pill: {
    height: 44,
    paddingHorizontal: 16,
  },
  lift: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
