import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { spacing, tabBar } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

type Slot = { x: number; width: number; content: number };

const CONTENT_PAD = 14;
const EDGE_GAP = 6;
const MOVE_MS = 280;
let lastTabIndex: number | null = null;

function pillFrame(slot: Slot | undefined, rowWidth: number) {
  "worklet";
  if (!slot || slot.width <= 0 || slot.content <= 0 || rowWidth <= 0) return null;
  const contentLeft = slot.x + (slot.width - slot.content) / 2;
  const contentRight = contentLeft + slot.content;
  let left = contentLeft - CONTENT_PAD;
  let right = contentRight + CONTENT_PAD;
  left = Math.max(left, EDGE_GAP);
  right = Math.min(right, rowWidth - EDGE_GAP);
  return { left, width: Math.max(right - left, slot.content) };
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
  const { colors, scheme, shadow } = useTheme();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const slots = useSharedValue<Slot[]>([]);
  const rowWidth = useSharedValue(0);
  const progress = useSharedValue(lastTabIndex ?? state.index);
  const measured = useRef<Slot[]>([]);

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
    slots.value = next.map((slot) => slot ?? { x: 0, width: 0, content: 0 });
  }

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    const previous = lastTabIndex;
    lastTabIndex = state.index;
    progress.value = withTiming(state.index, {
      duration: previous == null || previous === state.index ? 0 : MOVE_MS,
      easing: Easing.bezier(0.22, 0.9, 0.24, 1),
    });
  }, [progress, state.index]);

  const indicator = useAnimatedStyle(() => {
    const data = slots.value;
    const max = data.length - 1;
    if (max < 0) return { opacity: 0 };

    const p = Math.min(Math.max(progress.value, 0), max);
    const i0 = Math.floor(p);
    const t = p - i0;
    const from = pillFrame(data[i0], rowWidth.value);
    const to = t === 0 ? from : pillFrame(data[Math.min(i0 + 1, max)], rowWidth.value);
    if (from == null || to == null) return { opacity: 0 };

    const left = from.left + (to.left - from.left) * t;
    const width = from.width + (to.width - from.width) * t;
    const stretch = Math.sin(t * Math.PI) * Math.abs(to.left - from.left) * 0.45;

    return {
      opacity: 1,
      width: width + stretch,
      transform: [{ translateX: left - stretch / 2 }],
    };
  });

  if (hidden || keyboardOpen) return null;

  const dark = scheme === "dark";
  const pillBackground = dark ? "rgba(20, 90, 170, 0.55)" : "rgba(13, 110, 210, 0.28)";

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.position,
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
          {
            borderColor: dark ? "rgba(144, 202, 249, 0.34)" : "rgba(33, 150, 243, 0.34)",
            backgroundColor: dark ? "rgba(12, 36, 72, 0.55)" : "rgba(187, 222, 251, 0.72)",
          },
        ]}
      >
        <GlassFill soft />
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            { backgroundColor: pillBackground },
            indicator,
          ]}
        />
        <View
          accessibilityRole="tablist"
          collapsable={false}
          onLayout={(event) => {
            const width = event.nativeEvent.layout.width;
            if (width > 0) rowWidth.value = width;
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
                accessibilityLabel={typeof label === "string" ? label : route.name}
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
                    style={{ color, fontSize: tabBar.labelSize, fontWeight: "600" }}
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
    left: spacing.xl,
    right: spacing.xl,
    zIndex: 20,
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
    gap: 2,
  },
  pill: {
    position: "absolute",
    top: EDGE_GAP,
    bottom: EDGE_GAP,
    left: 0,
    borderRadius: tabBar.radius - EDGE_GAP,
  },
});
