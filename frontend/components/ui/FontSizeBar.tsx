import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { appFont, type FontScaleLevel } from "@/constants/font";
import { radius } from "@/constants/theme";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const LEVELS: { id: FontScaleLevel; sample: number }[] = [
  { id: "small", sample: 13 },
  { id: "medium", sample: 16 },
  { id: "large", sample: 20 },
  { id: "xl", sample: 26 },
];

const TRACK_PAD = 4;

export function FontSizeBar() {
  const { level, setLevel } = useFontScale();
  const { t } = useI18n();
  const { colors } = useTheme();
  const selectedIndex = Math.max(0, LEVELS.findIndex((option) => option.id === level));
  const progress = useSharedValue(selectedIndex);
  const trackWidth = useSharedValue(0);
  const count = LEVELS.length;

  const labels = {
    small: t("textSizeSmall"),
    medium: t("textSizeMedium"),
    large: t("textSizeLarge"),
    xl: t("textSizeXl"),
  } as const;

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

  function select(id: FontScaleLevel) {
    if (id === level) return;
    void Haptics.selectionAsync();
    setLevel(id);
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("textSize")}
      onLayout={(event) => {
        trackWidth.value = event.nativeEvent.layout.width;
      }}
      style={{
        direction: "ltr",
        flexDirection: "row",
        alignItems: "stretch",
        height: 78,
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
      {LEVELS.map((option) => {
        const selected = level === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={labels[option.id]}
            accessibilityState={{ selected }}
            onPress={() => select(option.id)}
            className="z-[1] min-w-0 flex-1 items-center justify-center active:opacity-90"
            style={{ paddingHorizontal: 4 }}
          >
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: appFont.semibold,
                fontSize: option.sample,
                lineHeight: option.sample + 4,
                color: selected ? colors.onAccent : colors.muted,
              }}
            >
              A
            </Text>
            <Text
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{
                marginTop: 2,
                fontFamily: appFont.medium,
                fontSize: 12,
                lineHeight: 16,
                color: selected ? colors.onAccent : colors.muted,
                textAlign: "center",
              }}
            >
              {labels[option.id]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
