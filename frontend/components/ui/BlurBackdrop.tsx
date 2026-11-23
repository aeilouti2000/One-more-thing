import { BlurTargetView, BlurView } from "expo-blur";
import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useTabBlurTarget } from "@/components/ui/TabBlurTarget";
import { withAlpha } from "@/constants/theme";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useTheme } from "@/providers/ThemeProvider";
import type { ViewHandle } from "@/lib/native-refs";

const BlurTargetContext = createContext<RefObject<ViewHandle | null> | null>(null);

export function BlurScreen({ children }: { children: ReactNode }) {
  const target = useRef<ViewHandle>(null);

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
  neutral = false,
  floating = true,
}: {
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
  neutral?: boolean;
  /**
   * Over other content (a dialog, a dock): solid in every theme. False for a
   * card that sits in the page, which is see-through in Glass like the rest.
   */
  floating?: boolean;
}) {
  const { scheme, colors } = useTheme();
  const dark = scheme === "dark";
  const surface = floating ? colors.overlay : colors.paper;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: neutral
              ? dark
                ? surface
                : colors.white
              : soft
                ? dark
                  ? surface
                  : "rgba(255, 255, 255, 0.96)"
                : surface,
          },
        ]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: neutral
              ? withAlpha(dark ? colors.white : "#12141A", dark ? 0.03 : 0.02)
              : withAlpha(colors.accentText, soft ? (dark ? 0.12 : 0.08) : dark ? 0.16 : 0.1),
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
              scheme === "dark" ? "rgba(18, 18, 18, 0.96)" : "rgba(255, 255, 255, 0.96)",
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
  neutral = false,
}: {
  style?: StyleProp<ViewStyle>;
  soft?: boolean;
  screenBlur?: boolean;
  neutral?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const screenTarget = useTabBlurTarget();
  const dark = scheme === "dark";
  // Only the tab bar may blur the screen. Cards sit inside that screen, and
  // blurring a view from inside it crashes Android on launch.
  const androidBlur = Platform.OS === "android" && screenBlur && screenTarget != null;

  if (Platform.OS === "android" && !androidBlur) {
    return <SolidFrost style={style} soft={soft} neutral={neutral} />;
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
            backgroundColor: neutral
              ? withAlpha(dark ? colors.overlay : colors.white, dark ? 0.88 : 0.92)
              : withAlpha(
                  colors.accentText,
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
    return <SolidFrost soft floating={false} />;
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
              scheme === "dark" ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.5)",
          },
        ]}
      />
    </>
  );
}

/** Android 12 and newer can blur the page from a dialog's own window; older ones cannot. */
const CAN_BLUR_FROM_DIALOG = Platform.OS === "android" && Number(Platform.Version) >= 31;

/**
 * Turns a dialog's surface into frosted glass in the glass theme: the page
 * under the dialog shows through it, blurred. Put it first inside the
 * surface (the view with the dialog's solid colour), and only in a dialog
 * that has its own window (a Modal): a blur drawn inside the page it blurs
 * crashes Android. A surface with rounded corners that does not clip its
 * children passes the same corners as `style`.
 *
 * Renders nothing, leaving the solid surface, in the other themes, on
 * Android 11 and older, and in the wide (unfolded) layout: two pages sit side
 * by side there and only one of them can be blurred.
 */
export function DialogGlass({ style }: { style?: StyleProp<ViewStyle> }) {
  const { colors, glass } = useTheme();
  const screenTarget = useTabBlurTarget();
  const wide = useWideLayout();
  if (!glass || !CAN_BLUR_FROM_DIALOG || wide || !screenTarget) return null;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, style]}>
      <BlurView
        pointerEvents="none"
        intensity={70}
        tint="systemUltraThinMaterialDark"
        blurReductionFactor={2}
        blurMethod="dimezisBlurViewSdk31Plus"
        blurTarget={screenTarget}
        style={StyleSheet.absoluteFill}
      />
      {/* Enough of the dialog's own colour for its text to read on any page. */}
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(colors.overlay, 0.42) }]}
      />
    </View>
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
          backgroundColor: scheme === "dark" ? "rgba(0, 0, 0, 0.62)" : "rgba(0, 0, 0, 0.4)",
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  clip: { overflow: "hidden" },
});
