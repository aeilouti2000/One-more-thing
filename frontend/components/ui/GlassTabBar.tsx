import type { BottomTabBarProps } from "expo-router/js-tabs";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  ZoomIn,
  ZoomOut,
  useAnimatedStyle,
  useSharedValue,
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
  const pos = useSharedValue(state.index);
  const gap = useSharedValue(center ? TAB_BAR_CENTER_GAP : 0);
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
    gap.set(withTiming(hasCenter ? TAB_BAR_CENTER_GAP : 0, { duration: MOVE_MS }));
  }, [gap, hasCenter]);

  useEffect(() => {
    pos.set(withTiming(state.index, { duration: MOVE_MS }));
  }, [pos, state.index]);

  const gapStyle = useAnimatedStyle(() => ({ width: gap.value }));

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
    const from = Math.floor(pos.value);
    const to = Math.min(count - 1, Math.ceil(pos.value));
    let middle = centerOf(from) + (centerOf(to) - centerOf(from)) * (pos.value - from);
    if (rtl.value === 1) middle = width - middle;
    const room = Math.min(middle - EDGE_GAP, width - EDGE_GAP - middle);
    // 0 normally, 1 while the center "+" is shown (animates with the gap).
    const centered = gap.value / TAB_BAR_CENTER_GAP;
    // With the center "+" the tabs get narrow and the edge tabs would shrink
    // the pill, so it grows wider and slides inward instead of squashing.
    const extra = CENTER_PILL_EXTRA * centered;
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
    return { opacity: 1, width: pill, left };
  });

  if (hidden || keyboardOpen) return null;

  const dark = scheme === "dark";
  const pillFill = dark
    ? withAlpha(colors.white, 0.0)
    : withAlpha(colors.accent, 0.14);
  const pillTint = withAlpha(colors.accent, dark ? 0.1 : 0.1);
  const pillBorder = withAlpha(colors.accent, dark ? 0.55 : 0.38);
  const pillSheen = dark
    ? ([withAlpha(colors.white, 0.2), withAlpha(colors.white, 0)] as const)
    : ([withAlpha(colors.white, 0.65), withAlpha(colors.white, 0.05)] as const);

  const sideInset = spacing.xl;
  const shellWidth = wide
    ? Math.min(tabBar.maxWidth, Math.max(0, windowWidth - sideInset * 2))
    : undefined;

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
      <View
        style={[
          styles.shell,
          shellWidth != null ? { width: shellWidth } : null,
          {
            borderColor: withAlpha(dark ? colors.muted : colors.accent, 0.34),
            backgroundColor: withAlpha(
              dark ? colors.deep : colors.mist,
              dark ? 0.55 : 0.72,
            ),
          },
        ]}
      >
        <GlassFill soft screenBlur />
        <Animated.View
          pointerEvents="none"
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
            const color = focused ? colors.accent : colors.muted;
            const label =
              typeof options.tabBarLabel === "string"
                ? options.tabBarLabel
                : (options.title ?? route.name);

            const tab = (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={
                  typeof label === "string" ? label : route.name
                }
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
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  if (width > 0) saveTabX(index, x);
                }}
                style={styles.tab}
              >
                <View
                  style={styles.label}
                  onLayout={(event) => {
                    const { width } = event.nativeEvent.layout;
                    if (width > 0) saveContent(index, width);
                  }}
                >
                  {options.tabBarIcon?.({ focused, color, size: 22 })}
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
                </View>
              </Pressable>
            );
            // Middle gap for the raised center button; animates open/closed.
            if (index === gapAfter) {
              return [tab, <Animated.View key="center-gap" style={gapStyle} />];
            }
            return tab;
          })}
        </View>
      </View>
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
  pill: {
    position: "absolute",
    top: EDGE_GAP,
    bottom: EDGE_GAP,
    left: 0,
    borderRadius: tabBar.radius - EDGE_GAP,
    borderWidth: 0.5,
    overflow: "hidden",
  },
});
