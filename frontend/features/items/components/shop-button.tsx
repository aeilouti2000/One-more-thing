import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { firstName } from "@/features/items/api/shop-locks";
import { tabBar, withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type Props = {
  count: number;
  disabled: boolean;
  lockedByName?: string | null;
  className?: string;
  onPress: () => void;
};

export function ShopButton({ count, disabled, lockedByName, className, onPress }: Props) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const locked = Boolean(lockedByName);
  const inactive = disabled || locked;
  const shopper = firstName(lockedByName);
  const dark = scheme === "dark";

  const cartX = useSharedValue(0);
  const cartBob = useSharedValue(0);
  const trail = useSharedValue(0);

  useEffect(() => {
    if (!locked) {
      cartX.value = 0;
      cartBob.value = 0;
      trail.value = 0;
      return;
    }

    // Ping-pong loops so the path never snaps back to the start.
    cartX.value = withRepeat(
      withTiming(5, { duration: 900, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    cartBob.value = withRepeat(
      withTiming(-2.5, { duration: 450, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    trail.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [cartBob, cartX, locked, trail]);

  const cartStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: cartX.value }, { translateY: cartBob.value }],
  }));

  const footA = useAnimatedStyle(() => ({
    opacity: interpolate(trail.value, [0, 0.35, 0.7], [0, 0.7, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(trail.value, [0, 1], [0, 8], Extrapolation.CLAMP) }],
  }));
  const footB = useAnimatedStyle(() => ({
    opacity: interpolate(trail.value, [0.15, 0.5, 0.85], [0, 0.55, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(trail.value, [0, 1], [2, 12], Extrapolation.CLAMP) }],
  }));
  const footC = useAnimatedStyle(() => ({
    opacity: interpolate(trail.value, [0.3, 0.65, 1], [0, 0.4, 0], Extrapolation.CLAMP),
    transform: [{ translateX: interpolate(trail.value, [0, 1], [4, 16], Extrapolation.CLAMP) }],
  }));

  const label = locked
    ? shopper
      ? t("shopLockedBy", { name: shopper })
      : t("shopLocked")
    : t("shopWithCount", { count });

  return (
    <Pressable
      disabled={inactive}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      className={`${className ?? ""} flex-row items-center justify-center gap-1 overflow-hidden rounded-xl px-3 py-2.5 ${
        inactive && !locked ? "opacity-45" : locked ? "" : "active:opacity-60"
      }`}
      style={{
        backgroundColor: locked
          ? withAlpha(colors.accent, 0.18)
          : colors.paper,
        borderWidth: tabBar.borderWidth,
        borderColor: withAlpha(dark ? colors.muted : colors.accent, 0.34),
      }}
    >
      {locked ? (
        <View style={styles.stage} pointerEvents="none">
          <View style={styles.trailRow}>
            <Animated.View
              style={[styles.foot, { backgroundColor: withAlpha(colors.accent, 0.55) }, footA]}
            />
            <Animated.View
              style={[styles.foot, { backgroundColor: withAlpha(colors.accent, 0.4) }, footB]}
            />
            <Animated.View
              style={[styles.foot, { backgroundColor: withAlpha(colors.accent, 0.28) }, footC]}
            />
          </View>
          <Animated.View style={cartStyle}>
            <MaterialCommunityIcons name="cart" size={16} color={colors.accent} />
          </Animated.View>
        </View>
      ) : (
        <MaterialCommunityIcons name="cart" size={16} color={colors.accent} />
      )}
      <AppText
        numberOfLines={1}
        className="shrink text-sm font-semibold"
        style={{ color: colors.accent }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    width: 22,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  trailRow: {
    position: "absolute",
    left: -2,
    top: 11,
    flexDirection: "row",
    gap: 3,
  },
  foot: {
    width: 3,
    height: 2,
    borderRadius: 1,
  },
});
