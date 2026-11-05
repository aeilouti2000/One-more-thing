import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { appFont, type FontScaleLevel } from "@/constants/font";
import { withAlpha } from "@/constants/theme";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const LEVELS: FontScaleLevel[] = ["small", "medium", "large", "xl"];
const THUMB = 26;
const TRACK = 6;

/**
 * Text size: a live preview of a list row, then a stepped slider between a
 * small and a large "A". Tap anywhere on the track to jump to that step.
 */
export function FontSizeBar() {
  const { level, setLevel } = useFontScale();
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";
  const index = Math.max(0, LEVELS.indexOf(level));
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(index);

  const labels: Record<FontScaleLevel, string> = {
    small: t("textSizeSmall"),
    medium: t("textSizeMedium"),
    large: t("textSizeLarge"),
    xl: t("textSizeXl"),
  };

  useEffect(() => {
    progress.set(withTiming(index, { duration: 220 }));
  }, [progress, index]);

  // Usable span: thumb centre travels between the two ends.
  const span = Math.max(0, width - THUMB);
  const thumbStyle = useAnimatedStyle(() => {
    const x = (progress.value / (LEVELS.length - 1)) * span;
    return { transform: [{ translateX: isRTL ? span - x : x }] };
  });
  const fillStyle = useAnimatedStyle(() => ({
    width: (progress.value / (LEVELS.length - 1)) * span,
  }));

  function select(next: number) {
    const clamped = Math.min(LEVELS.length - 1, Math.max(0, next));
    if (clamped === index) return;
    void Haptics.selectionAsync();
    setLevel(LEVELS[clamped]);
  }

  return (
    <View className="gap-5">
      {/* Live preview — uses the app text, so it scales with the choice. */}
      <View
        className="gap-1 rounded-2xl px-4 py-3"
        style={{ backgroundColor: dark ? withAlpha(colors.white, 0.04) : colors.ice }}
      >
        <View className="flex-row items-center gap-2.5">
          <View
            style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.accent }}
          />
          <AppText className="flex-1 text-base font-semibold text-cove-ink">{t("previewMilk")}</AppText>
          <AppText className="text-sm text-cove-muted">×2</AppText>
        </View>
        <AppText className="text-sm text-cove-muted">{t("welcomeAddedByYou")}</AppText>
      </View>

      <View
        accessibilityRole="adjustable"
        accessibilityLabel={t("textSize")}
        accessibilityValue={{ text: labels[level] }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) =>
          select(index + (event.nativeEvent.actionName === "increment" ? 1 : -1))
        }
        className="flex-row items-center gap-3"
      >
        <Pressable onPress={() => select(index - 1)} hitSlop={10} accessibilityElementsHidden>
          <Text allowFontScaling={false} style={{ fontFamily: appFont.semibold, fontSize: 14, color: colors.muted }}>
            A
          </Text>
        </Pressable>

        <View
          style={{ flex: 1, height: THUMB, justifyContent: "center", direction: "ltr" }}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        >
          {/* Track + fill */}
          <View
            style={{
              position: "absolute",
              left: THUMB / 2,
              right: THUMB / 2,
              height: TRACK,
              borderRadius: TRACK / 2,
              backgroundColor: withAlpha(colors.muted, 0.22),
            }}
          />
          <Animated.View
            style={[
              {
                position: "absolute",
                [isRTL ? "right" : "left"]: THUMB / 2,
                height: TRACK,
                borderRadius: TRACK / 2,
                backgroundColor: colors.accent,
              },
              fillStyle,
            ]}
          />
          {/* Step dots, each a tap target */}
          {LEVELS.map((id, step) => {
            const x = (step / (LEVELS.length - 1)) * span;
            const left = isRTL ? span - x : x;
            return (
              <Pressable
                key={id}
                onPress={() => select(step)}
                accessibilityElementsHidden
                style={{ position: "absolute", left, width: THUMB, height: THUMB, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: step <= index ? colors.onAccent : withAlpha(colors.muted, 0.45),
                  }}
                />
              </Pressable>
            );
          })}
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                left: 0,
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                backgroundColor: colors.white,
                borderWidth: 3,
                borderColor: colors.accent,
                shadowColor: "#000",
                shadowOpacity: 0.18,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              },
              thumbStyle,
            ]}
          />
        </View>

        <Pressable onPress={() => select(index + 1)} hitSlop={10} accessibilityElementsHidden>
          <Text allowFontScaling={false} style={{ fontFamily: appFont.semibold, fontSize: 24, color: colors.muted }}>
            A
          </Text>
        </Pressable>
      </View>

      <AppText className="-mt-2 text-center text-sm font-semibold text-cove-accent">
        {labels[level]}
      </AppText>
    </View>
  );
}
