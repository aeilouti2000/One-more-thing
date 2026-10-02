import { BlurTargetView, BlurView } from "expo-blur";
import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTabBlurTarget } from "@/components/ui/TabBlurTarget";
import { withAlpha } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

const BlurTargetContext = createContext<RefObject<View | null> | null>(null);

export function BlurScreen({ children }: { children: ReactNode }) {
  const target = useRef<View>(null);

  if (Platform.OS === "android") {
    return <View style={styles.fill}>{children}</View>;
  }

  return (
    <BlurTargetContext.Provider value={target}>
      <BlurTargetView ref={target} style={styles.fill}>
        {children}
      </BlurTargetView>
    </BlurTargetContext.Provider>
  );
}

type BlurBackdropProps = {
  onPress?: () => void;
  disabled?: boolean;
};

function SolidFrost({
  style,
  soft = false,
}: {
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
}) {
  const { scheme, colors } = useTheme();
  const dark = scheme === "dark";

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: soft
              ? dark
                ? colors.paper
                : "rgba(255, 255, 255, 0.96)"
              : colors.paper,
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: withAlpha(colors.accent, soft ? (dark ? 0.12 : 0.08) : dark ? 0.16 : 0.1),
          },
        ]}
      />
    </View>
  );
}

export function FrostedBlur({ style }: { style?: StyleProp<ViewStyle> }) {
  const { scheme } = useTheme();
  const blurTarget = useContext(BlurTargetContext);

  // Android cannot safely blur a parent that contains the blur view.
  if (Platform.OS === "android") {
    return (
      <View
        pointerEvents="none"
        style={[
          style,
          {
            backgroundColor:
              scheme === "dark" ? "rgba(19, 34, 56, 0.96)" : "rgba(255, 255, 255, 0.96)",
          },
        ]}
      />
    );
  }

  return (
    <BlurView
      intensity={scheme === "dark" ? 80 : 56}
      tint={scheme === "dark" ? "dark" : "light"}
      blurTarget={blurTarget ?? undefined}
      blurReductionFactor={2}
      pointerEvents="none"
      style={style}
    />
  );
}

export function GlassFill({
  style,
  soft = false,
  screenBlur = false,
}: {
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
  screenBlur?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const screenTarget = useTabBlurTarget();
  const dark = scheme === "dark";
  // Only the tab bar may blur the screen. Cards sit inside that screen, and
  // blurring a view from inside it crashes Android on launch.
  const androidBlur = Platform.OS === "android" && screenBlur && screenTarget != null;

  if (Platform.OS === "android" && !androidBlur) {
    return <SolidFrost style={style} soft={soft} />;
  }

  const intensity = soft
    ? dark
      ? Platform.OS === "android"
        ? 30
        : 36
      : Platform.OS === "android"
        ? 22
        : 28
    : dark
      ? Platform.OS === "android"
        ? 64
        : 90
      : Platform.OS === "android"
        ? 42
        : 72;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <BlurView
        pointerEvents="none"
        intensity={intensity}
        tint={dark ? "systemThinMaterialDark" : "systemThinMaterialLight"}
        blurReductionFactor={dark ? 2.56 : 1.68}
        blurMethod={androidBlur ? "dimezisBlurViewSdk31Plus" : undefined}
        blurTarget={androidBlur ? screenTarget : undefined}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: withAlpha(
              colors.accent,
              soft ? (dark ? 0.06 : 0.08) : dark ? 0.22 : 0.24,
            ),
          },
        ]}
      />
    </View>
  );
}

export function FrostedFill() {
  const { scheme } = useTheme();

  if (Platform.OS === "android") {
    return <SolidFrost soft />;
  }

  return (
    <>
      <FrostedBlur style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor:
              scheme === "dark" ? "rgba(19, 34, 56, 0.58)" : "rgba(255, 255, 255, 0.5)",
          },
        ]}
      />
    </>
  );
}

export function BlurBackdrop({ onPress, disabled = false }: BlurBackdropProps) {
  const { scheme } = useTheme();

  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor:
            scheme === "dark" ? "rgba(7, 14, 28, 0.62)" : "rgba(13, 71, 161, 0.34)",
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
