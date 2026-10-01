import { BlurTargetView, BlurView } from "expo-blur";
import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTabBlurTarget } from "@/components/ui/TabBlurTarget";
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

export function FrostedBlur({ style }: { style?: StyleProp<ViewStyle> }) {
  const { scheme } = useTheme();
  const blurTarget = useContext(BlurTargetContext);

  // Android's blur view crashes if it is drawn inside the screen it blurs.
  // The tab bar and cards mount that way, so use a solid frost there instead.
  if (Platform.OS === "android") {
    return (
      <View
        pointerEvents="none"
        style={[
          style,
          {
            backgroundColor:
              scheme === "dark" ? "rgba(19, 34, 56, 0.94)" : "rgba(255, 255, 255, 0.94)",
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
}: {
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
}) {
  const { scheme } = useTheme();
  const screenTarget = useTabBlurTarget();
  const dark = scheme === "dark";
  const androidBlur = Platform.OS === "android" && screenTarget != null;
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
            backgroundColor: soft
              ? dark
                ? "rgba(36, 120, 210, 0.06)"
                : "rgba(33, 150, 243, 0.08)"
              : dark
                ? "rgba(36, 120, 210, 0.22)"
                : "rgba(33, 150, 243, 0.24)",
          },
        ]}
      />
    </View>
  );
}

export function FrostedFill() {
  const { scheme } = useTheme();

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
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={StyleSheet.absoluteFill}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
