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
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { spacing, tabBar, withAlpha } from "@/constants/theme";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useTheme } from "@/providers/ThemeProvider";

type Slot = { x: number; width: number; content: number };

const CONTENT_PAD = 16;
const EDGE_GAP = 4;
const MOVE_MS = 250;

function pillFrame(slot: Slot | undefined, rowWidth: number, content: number) {
  if (!slot || slot.width <= 0 || content <= 0 || rowWidth <= 0) return null;
  const center = slot.x + slot.width / 2;
  const room = Math.min(center - EDGE_GAP, rowWidth - EDGE_GAP - center);
  const width = Math.min(content + CONTENT_PAD * 2, Math.max(0, room * 2));
  return { left: center - width / 2, width };
}

export function GlassTabBar({
  state,
  descriptors,
  navigation,
  hidden,
}: BottomTabBarProps & {
  hidden: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const wide = useWideLayout();
  const { colors, scheme, shadow } = useTheme();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const pillLeft = useSharedValue(0);
  const pillWidth = useSharedValue(0);
  const measured = useRef<Slot[]>([]);
  const rowW = useRef(0);
  const indexRef = useRef(state.index);
  const placed = useRef(false);
  const animating = useRef(false);

  function widestContent() {
    let max = 0;
    for (const slot of measured.current) {
      if (slot && slot.content > max) max = slot.content;
    }
    return max;
  }

  function goTo(index: number, animated: boolean) {
    const frame = pillFrame(measured.current[index], rowW.current, widestContent());
    if (!frame) return;
    if (!placed.current || !animated) {
      if (animating.current && !animated) return;
      pillLeft.value = frame.left;
      pillWidth.value = frame.width;
      placed.current = true;
      return;
    }
    animating.current = true;
    pillLeft.value = withTiming(frame.left, { duration: MOVE_MS });
    pillWidth.value = withTiming(frame.width, { duration: MOVE_MS });
    setTimeout(() => {
      animating.current = false;
      goTo(indexRef.current, false);
    }, MOVE_MS + 16);
  }

  const goToRef = useRef(goTo);
  useEffect(() => {
    goToRef.current = goTo;
  });

  function saveSlot(index: number, patch: Partial<Slot>) {
    const prev = measured.current[index] ?? { x: 0, width: 0, content: 0 };
    const nextSlot = { ...prev, ...patch };
    if (
      Math.abs(prev.x - nextSlot.x) < 0.5 &&
      Math.abs(prev.width - nextSlot.width) < 0.5 &&
      Math.abs(prev.content - nextSlot.content) < 0.5
    ) {
      return;
    }
    const next = measured.current.slice();
    next[index] = nextSlot;
    measured.current = next;
    if (placed.current || index === indexRef.current) goTo(indexRef.current, false);
  }

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

  useEffect(() => {
    indexRef.current = state.index;
    goToRef.current(state.index, placed.current);
  }, [state.index]);

  const indicator = useAnimatedStyle(() => ({
    opacity: pillWidth.value > 0 ? 1 : 0,
    width: pillWidth.value,
    left: pillLeft.value,
  }));

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
            if (width <= 0) return;
            rowW.current = width;
            goTo(indexRef.current, false);
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

            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={
                  typeof label === "string" ? label : route.name
                }
                onPress={() => {
                  const event = navigation.emit({
                    type: "tabPress",
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) {
                    navigation.navigate(route.name, route.params);
                  }
                }}
                onLongPress={() => {
                  navigation.emit({ type: "tabLongPress", target: route.key });
                }}
                onLayout={(event) => {
                  const { x, width } = event.nativeEvent.layout;
                  if (width <= 0) return;
                  saveSlot(index, { x, width });
                }}
                style={styles.tab}
                android_ripple={null}
              >
                <View
                  style={styles.label}
                  onLayout={(event) => {
                    const { width } = event.nativeEvent.layout;
                    if (width <= 0) return;
                    saveSlot(index, { content: width });
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
          })}
        </View>
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
