import { useEffect, useMemo } from "react";
import { Pressable, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import {
  getColors,
  radius,
  SURFACE_DEPTH_LEVELS,
  type SurfaceDepth,
  withAlpha,
} from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const TRACK_PAD = 4;
const PREVIEW = 36;

type SurfaceDepthBarProps = {
  value: SurfaceDepth;
  onChange: (depth: SurfaceDepth) => void;
  accentHex?: string;
};

export function SurfaceDepthBar({
  value,
  onChange,
  accentHex,
}: SurfaceDepthBarProps) {
  const { t } = useI18n();
  const { accent, colors } = useTheme();
  const selectedIndex = Math.max(0, SURFACE_DEPTH_LEVELS.indexOf(value));
  const progress = useSharedValue(selectedIndex);
  const trackWidth = useSharedValue(0);
  const count = SURFACE_DEPTH_LEVELS.length;
  const previewAccent = accentHex ?? accent;

  const labels = useMemo(
    () =>
      ({
        soft: t("surfaceDepthSoft"),
        default: t("surfaceDepthDefault"),
        deep: t("surfaceDepthDeep"),
        true: t("surfaceDepthTrue"),
      }) as const,
    [t],
  );

  const previews = useMemo(
    () =>
      SURFACE_DEPTH_LEVELS.map((depth) => ({
        depth,
        palette: getColors("dark", previewAccent, depth),
      })),
    [previewAccent],
  );

  useEffect(() => {
    progress.value = withTiming(selectedIndex, { duration: 240 });
  }, [progress, selectedIndex]);

  const thumbStyle = useAnimatedStyle(() => {
    const inner = Math.max(0, trackWidth.value - TRACK_PAD * 2);
    const cell = inner / count;
    return {
      width: cell,
      left: TRACK_PAD + progress.value * cell,
    };
  });

  function select(depth: SurfaceDepth) {
    if (depth === value) return;
    void Haptics.selectionAsync();
    onChange(depth);
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("surfaceDepth")}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width;
      }}
      style={{
        direction: "ltr",
        flexDirection: "row",
        alignItems: "stretch",
        height: 92,
        padding: TRACK_PAD,
        borderRadius: radius.md,
        // Transparent track so unselected options sit on the parent card.
        backgroundColor: "transparent",
        alignSelf: "stretch",
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: TRACK_PAD,
            bottom: TRACK_PAD,
            left: 0,
            borderRadius: radius.md,
            backgroundColor: colors.accent,
            shadowColor: colors.accent,
            shadowOpacity: 0.28,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 3 },
            elevation: 3,
          },
          thumbStyle,
        ]}
      />
      {previews.map(({ depth, palette }) => {
        const selected = value === depth;
        return (
          <Pressable
            key={depth}
            accessibilityRole="radio"
            accessibilityLabel={labels[depth]}
            accessibilityState={{ selected }}
            onPress={() => select(depth)}
            className="z-[1] min-w-0 flex-1 items-center justify-center active:opacity-90"
            style={{ paddingHorizontal: 4, gap: 6 }}
          >
            <View
              style={{
                width: PREVIEW,
                height: PREVIEW,
                borderRadius: 10,
                overflow: "hidden",
                backgroundColor: palette.ice,
                borderWidth: 1,
                borderColor: selected
                  ? withAlpha(colors.onAccent, 0.35)
                  : withAlpha(colors.ink, 0.12),
              }}
            >
              <View
                style={{
                  position: "absolute",
                  left: 5,
                  right: 5,
                  top: 7,
                  height: 14,
                  borderRadius: 5,
                  backgroundColor: palette.paper,
                  borderWidth: 1,
                  borderColor: palette.line,
                }}
              />
              <View
                style={{
                  position: "absolute",
                  left: 5,
                  right: 12,
                  bottom: 5,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: palette.mist,
                }}
              />
            </View>
            <AppText
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              allowFontScaling={false}
              style={{
                fontSize: 12,
                lineHeight: 16,
                fontWeight: "600",
                color: selected ? colors.onAccent : colors.muted,
                textAlign: "center",
              }}
            >
              {labels[depth]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
