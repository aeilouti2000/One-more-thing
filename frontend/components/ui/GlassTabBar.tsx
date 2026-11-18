import type { BottomTabBarProps } from "expo-router/js-tabs";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  ZoomIn,
  ZoomOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { spacing, tabBar, withAlpha } from "@/constants/theme";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useTabBarCenter } from "@/components/ui/TabBarVisibility";
import { useTheme } from "@/providers/ThemeProvider";

const CONTENT_PAD = 16;
const EDGE_GAP = 4;
const CENTER_PILL_EXTRA = 0;
const MOVE_MS = 250;
const FADE_MS = 220;
// The pill's two ends ride separate springs: whichever end faces the new tab
// follows the fast one and the other follows the slow one, so the pill
// stretches toward its target and then settles.
const LEAD_SPRING = { mass: 1, stiffness: 720, damping: 42 };
const TRAIL_SPRING = { mass: 1, stiffness: 235, damping: 28 };
// Tighter springs while a finger drags the pill, so it keeps up with the hand.
const DRAG_LEAD_SPRING = { mass: 1, stiffness: 900, damping: 46 };
const DRAG_TRAIL_SPRING = { mass: 1, stiffness: 330, damping: 30 };
/** Sideways travel (dp) before a touch on the bar becomes a pill drag. */
const DRAG_START = 8;
/** How much the pill grows while held. */
const HELD_SCALE = 0.08;
const ICON_SPRING = { mass: 1, stiffness: 420, damping: 16 };
const PRESS_SPRING = { mass: 1, stiffness: 600, damping: 30 };

/** Apple's Liquid Glass, iOS 26+ only. Everywhere else the bar stays blurred. */
function hasLiquidGlass() {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}
const REAL_GLASS = hasLiquidGlass();

/** Gap between the middle tabs reserved for the center button. */
export const TAB_BAR_CENTER_GAP = 72;
/**
 * Touch room above the bar for the raised center button and its menu.
 * Android ignores touches outside a parent's bounds, so the bar grows upward
 * (box-none, so empty space still passes touches to the screen).
 */
export const TAB_BAR_CENTER_RISE = 240;

export function GlassTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  hidden,
}: BottomTabBarProps & {
  hidden: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const wide = useWideLayout();
  const { colors, scheme, shadow } = useTheme();
  const center = useTabBarCenter();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const count = state.routes.length;
  const gapAfter = Math.ceil(count / 2) - 1;
  // Pill geometry is computed from these on the UI thread every frame, so it
  // stays glued to its tab while the center gap opens or closes.
  const rowWidth = useSharedValue(0);
  const content = useSharedValue(0);
  const rtl = useSharedValue(0);
  const lead = useSharedValue(state.index);
  const trail = useSharedValue(state.index);
  const gap = useSharedValue(center ? TAB_BAR_CENTER_GAP : 0);
  const held = useSharedValue(0);
  // Tab under the finger while the pill is dragged; the page itself only
  // changes when the finger lifts.
  const hover = useSharedValue(-1);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const contentWidths = useRef<number[]>([]);
  const tabX = useRef<number[]>([]);

  function saveContent(index: number, width: number) {
    contentWidths.current[index] = width;
    content.set(Math.max(0, ...contentWidths.current.filter(Boolean)));
  }

  function saveTabX(index: number, x: number) {
    tabX.current[index] = x;
    const first = tabX.current[0];
    const last = tabX.current[count - 1];
    if (first != null && last != null) rtl.set(first > last ? 1 : 0);
  }

  const hasCenter = center != null;
  useEffect(() => {
    gap.set(
      withTiming(hasCenter ? TAB_BAR_CENTER_GAP : 0, { duration: MOVE_MS }),
    );
  }, [gap, hasCenter]);

  useEffect(() => {
    lead.set(withSpring(state.index, LEAD_SPRING));
    trail.set(withSpring(state.index, TRAIL_SPRING));
  }, [lead, trail, state.index]);

  const gapStyle = useAnimatedStyle(() => ({ width: gap.value }));

  /** Tab position (0 = first tab, fractions in between) under bar x. */
  const tabAt = (x: number) => {
    "worklet";
    const width = rowWidth.value;
    if (width <= 0) return 0;
    const tab = (width - gap.value) / count;
    const centerOf = (i: number) =>
      tab * (i + 0.5) + (i > gapAfter ? gap.value : 0);
    const at = rtl.value === 1 ? width - x : x;
    if (at <= centerOf(0)) return 0;
    for (let i = 0; i < count - 1; i++) {
      const from = centerOf(i);
      const to = centerOf(i + 1);
      if (at <= to) return i + (at - from) / (to - from);
    }
    return count - 1;
  };

  function showHover(index: number) {
    setHoverIndex(index);
    void Haptics.selectionAsync();
  }

  function dropOn(index: number) {
    setHoverIndex(null);
    const route = state.routes[index];
    if (!route) return;
    const focused = state.index === index;
    const event = emitter.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigateToTab(route.key);
    } else if (!focused) {
      // The screen refused the switch, so the pill goes back home.
      lead.set(withSpring(state.index, LEAD_SPRING));
      trail.set(withSpring(state.index, TRAIL_SPRING));
    }
  }

  // Slide a finger along the bar and the pill follows it; let go and the app
  // opens whichever tab the pill is over. A plain tap never gets this far.
  const drag = Gesture.Pan()
    .activeOffsetX([-DRAG_START, DRAG_START])
    .failOffsetY([-24, 24])
    .onStart((event) => {
      held.set(withSpring(1, PRESS_SPRING));
      const at = tabAt(event.x);
      hover.set(Math.round(at));
      lead.set(withSpring(at, DRAG_LEAD_SPRING));
      trail.set(withSpring(at, DRAG_TRAIL_SPRING));
      runOnJS(setHoverIndex)(Math.round(at));
    })
    .onUpdate((event) => {
      const at = tabAt(event.x);
      lead.set(withSpring(at, DRAG_LEAD_SPRING));
      trail.set(withSpring(at, DRAG_TRAIL_SPRING));
      const over = Math.round(at);
      if (over !== hover.value) {
        hover.set(over);
        runOnJS(showHover)(over);
      }
    })
    .onFinalize((event, success) => {
      if (hover.value < 0) return;
      held.set(withSpring(0, PRESS_SPRING));
      const target = success ? hover.value : state.index;
      hover.set(-1);
      lead.set(withSpring(target, LEAD_SPRING));
      trail.set(withSpring(target, TRAIL_SPRING));
      if (success) runOnJS(dropOn)(target);
      else runOnJS(setHoverIndex)(null);
    });

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const indicator = useAnimatedStyle(() => {
    const width = rowWidth.value;
    if (width <= 0 || content.value <= 0) return { opacity: 0 };
    const tab = (width - gap.value) / count;
    const centerOf = (i: number) =>
      tab * (i + 0.5) + (i > gapAfter ? gap.value : 0);
    // 0 normally, 1 while the center "+" is shown (animates with the gap).
    const centered = gap.value / TAB_BAR_CENTER_GAP;
    // With the center "+" the tabs get narrow and the edge tabs would shrink
    // the pill, so it grows wider and slides inward instead of squashing.
    const extra = CENTER_PILL_EXTRA * centered;
    /** Left and right edge of a resting pill at tab position `at`. */
    const edges = (at: number) => {
      const p = Math.min(count - 1, Math.max(0, at));
      const from = Math.floor(p);
      const to = Math.min(count - 1, Math.ceil(p));
      let middle =
        centerOf(from) + (centerOf(to) - centerOf(from)) * (p - from);
      if (rtl.value === 1) middle = width - middle;
      const room = Math.min(middle - EDGE_GAP, width - EDGE_GAP - middle);
      const pill = Math.max(
        0,
        Math.min(
          content.value + CONTENT_PAD * 2 + extra,
          tab + extra,
          room * 2 + (tab + extra) * centered,
        ),
      );
      const left = Math.min(
        Math.max(middle - pill / 2, EDGE_GAP),
        width - EDGE_GAP - pill,
      );
      return [left, left + pill];
    };
    const fast = edges(lead.value);
    const slow = edges(trail.value);
    const left = Math.min(fast[0], slow[0]);
    const pill = Math.max(fast[1], slow[1]) - left;
    return {
      opacity: 1,
      width: pill,
      // The pill rests centred in the bar and is moved with a transform.
      // A `left` offset gets mirrored by the system on right-to-left phones,
      // which sent the pill to the opposite tab.
      transform: [
        { translateX: left + pill / 2 - width / 2 },
        { scale: 1 + HELD_SCALE * held.value },
      ],
    };
  });

  if (hidden || keyboardOpen) return null;

  const dark = scheme === "dark";
  const pillFill = dark
    ? withAlpha(colors.white, 0.0)
    : withAlpha(colors.accentText, 0.14);
  const pillTint = withAlpha(colors.accentText, dark ? 0.1 : 0.1);
  const pillBorder = withAlpha(colors.accentText, dark ? 0.55 : 0.38);
  const pillSheen = dark
    ? ([withAlpha(colors.white, 0.2), withAlpha(colors.white, 0)] as const)
    : ([withAlpha(colors.white, 0.65), withAlpha(colors.white, 0.05)] as const);

  const sideInset = spacing.xl;
  const shellWidth = wide
    ? Math.min(tabBar.maxWidth, Math.max(0, windowWidth - sideInset * 2))
    : undefined;

  const shellSize = shellWidth != null ? { width: shellWidth } : null;
  const shellContent = (
    <>
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.track]}
      >
        <Animated.View
          style={[
            styles.pill,
            {
              backgroundColor: pillFill,
              borderColor: pillBorder,
            },
            indicator,
          ]}
        >
          <View
            style={[StyleSheet.absoluteFill, { backgroundColor: pillTint }]}
          />
          <LinearGradient
            colors={[...pillSheen]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
      <View
        accessibilityRole="tablist"
        collapsable={false}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          if (width > 0) rowWidth.set(width);
        }}
        style={[StyleSheet.absoluteFill, styles.row]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : (options.title ?? route.name);

          const tab = (
            <TabItem
              key={route.key}
              focused={focused}
              highlighted={(hoverIndex ?? state.index) === index}
              label={label}
              icon={options.tabBarIcon}
              activeColor={colors.accentText}
              idleColor={colors.muted}
              onPress={() => {
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigateToTab(route.key);
                }
              }}
              onLongPress={() => {
                emitter.emit({ type: "tabLongPress", target: route.key });
              }}
              onTabX={(x) => saveTabX(index, x)}
              onContentWidth={(width) => saveContent(index, width)}
            />
          );
          // Middle gap for the raised center button; animates open/closed.
          if (index === gapAfter) {
            return [tab, <Animated.View key="center-gap" style={gapStyle} />];
          }
          return tab;
        })}
      </View>
    </>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.position,
        wide ? styles.positionWide : styles.positionPhone,
        { paddingTop: TAB_BAR_CENTER_RISE },
        {
          bottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
          shadowColor: shadow.color,
          shadowOffset: shadow.offset,
          shadowOpacity: dark ? 0.42 : 0.16,
          shadowRadius: 24,
          elevation: shadow.elevation,
        },
      ]}
    >
      <GestureDetector gesture={drag}>
        {REAL_GLASS ? (
          <GlassView
            glassEffectStyle="regular"
            colorScheme={dark ? "dark" : "light"}
            style={[styles.shell, styles.shellGlass, shellSize]}
          >
            {shellContent}
          </GlassView>
        ) : (
          <View
            collapsable={false}
            style={[
              styles.shell,
              shellSize,
              {
                borderColor: withAlpha(
                  dark ? colors.muted : colors.accentText,
                  0.34,
                ),
                backgroundColor: withAlpha(
                  dark ? colors.deep : colors.mist,
                  dark ? 0.55 : 0.72,
                ),
              },
            ]}
          >
            <GlassFill soft screenBlur />
            {shellContent}
          </View>
        )}
      </GestureDetector>
      {/* Always mounted so the button's exit animation can play. */}
      <View pointerEvents="box-none" style={styles.center}>
        {center ? (
          <Animated.View
            pointerEvents="box-none"
            entering={ZoomIn.duration(MOVE_MS)}
            exiting={ZoomOut.duration(180)}
          >
            {center}
          </Animated.View>
        ) : null}
      </View>
    </View>
  );
}

type TabItemProps = {
  focused: boolean;
  /** Drawn as selected: the open tab, or the one under a dragged pill. */
  highlighted: boolean;
  label: string;
  icon?: (props: {
    focused: boolean;
    color: string;
    size: number;
  }) => ReactNode;
  activeColor: string;
  idleColor: string;
  onPress: () => void;
  onLongPress: () => void;
  onTabX: (x: number) => void;
  onContentWidth: (width: number) => void;
};

/**
 * One tab. The idle and selected looks are stacked and cross-faded, so the
 * colour and the outline/filled icon change smoothly instead of snapping.
 */
function TabItem({
  focused,
  highlighted,
  label,
  icon,
  activeColor,
  idleColor,
  onPress,
  onLongPress,
  onTabX,
  onContentWidth,
}: TabItemProps) {
  const active = useSharedValue(highlighted ? 1 : 0);
  const pop = useSharedValue(highlighted ? 1 : 0);
  const pressed = useSharedValue(0);

  useEffect(() => {
    active.set(withTiming(highlighted ? 1 : 0, { duration: FADE_MS }));
    pop.set(withSpring(highlighted ? 1 : 0, ICON_SPRING));
  }, [active, pop, highlighted]);

  const idleStyle = useAnimatedStyle(() => ({ opacity: 1 - active.value }));
  const activeStyle = useAnimatedStyle(() => ({ opacity: active.value }));
  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: -pop.value },
      { scale: (1 + 0.12 * pop.value) * (1 - 0.12 * pressed.value) },
    ],
  }));

  const face = (selected: boolean) => {
    const color = selected ? activeColor : idleColor;
    return (
      <>
        <Animated.View style={iconStyle}>
          {icon?.({ focused: selected, color, size: 22 })}
        </Animated.View>
        <AppText
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{
            color,
            fontSize: tabBar.labelSize,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {label}
        </AppText>
      </>
    );
  };

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => pressed.set(withSpring(1, PRESS_SPRING))}
      onPressOut={() => pressed.set(withSpring(0, PRESS_SPRING))}
      onLayout={(event) => {
        const { x, width } = event.nativeEvent.layout;
        if (width > 0) onTabX(x);
      }}
      style={styles.tab}
    >
      <View
        onLayout={(event) => {
          const { width } = event.nativeEvent.layout;
          if (width > 0) onContentWidth(width);
        }}
      >
        <Animated.View style={[styles.label, idleStyle]}>
          {face(false)}
        </Animated.View>
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, styles.label, activeStyle]}
        >
          {face(true)}
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  position: {
    position: "absolute",
    zIndex: 20,
  },
  positionPhone: {
    left: spacing.xl,
    right: spacing.xl,
  },
  center: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  positionWide: {
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shell: {
    height: tabBar.height,
    borderRadius: tabBar.radius,
    borderWidth: tabBar.borderWidth,
    overflow: "hidden",
  },
  shellGlass: {
    borderWidth: 0,
  },
  row: {
    flexDirection: "row",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  track: {
    alignItems: "center",
    paddingVertical: EDGE_GAP,
  },
  pill: {
    flex: 1,
    borderRadius: tabBar.radius - EDGE_GAP,
    borderWidth: 0.5,
    overflow: "hidden",
  },
});
