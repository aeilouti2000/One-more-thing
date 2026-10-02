import { useRef } from "react";
import { PanResponder, Text, View } from "react-native";
import { appFont, type FontScaleLevel } from "@/constants/font";
import { withAlpha } from "@/constants/theme";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const LEVELS: FontScaleLevel[] = ["small", "medium", "large"];
const THUMB = 26;
const TRACK = 4;

export function FontSizeBar() {
  const { level, setLevel } = useFontScale();
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const widthRef = useRef(1);
  const levelRef = useRef(level);
  levelRef.current = level;
  const index = LEVELS.indexOf(level);
  const groove = scheme === "dark" ? withAlpha(colors.ink, 0.16) : colors.mist;
  const tick = scheme === "dark" ? withAlpha(colors.ink, 0.55) : colors.line;
  const labels = {
    small: t("textSizeSmall"),
    medium: t("textSizeMedium"),
    large: t("textSizeLarge"),
  } as const;

  function snap(x: number) {
    const inner = widthRef.current - THUMB;
    if (inner <= 0) return;
    const ratio = Math.min(1, Math.max(0, (x - THUMB / 2) / inner));
    const next = LEVELS[Math.round(ratio * (LEVELS.length - 1))];
    if (next !== levelRef.current) setLevel(next);
  }

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => snap(event.nativeEvent.locationX),
      onPanResponderMove: (event) => snap(event.nativeEvent.locationX),
    }),
  ).current;

  const progress = `${(index / (LEVELS.length - 1)) * 100}%` as const;

  return (
    <View style={{ direction: "ltr" }}>
      <View className="flex-row items-center gap-4">
        <Text
          allowFontScaling={false}
          style={{ fontFamily: appFont.medium, fontSize: 13, color: colors.muted, width: 16, textAlign: "center" }}
        >
          A
        </Text>
        <View
          className="h-12 flex-1 justify-center"
          accessibilityRole="adjustable"
          accessibilityLabel={t("textSize")}
          accessibilityValue={{ min: 0, max: 2, now: index, text: labels[level] }}
          onLayout={(event) => {
            widthRef.current = event.nativeEvent.layout.width;
          }}
          {...pan.panHandlers}
        >
          <View pointerEvents="none" style={{ marginHorizontal: THUMB / 2, height: 18, justifyContent: "center" }}>
            <View style={{ height: TRACK, borderRadius: TRACK, backgroundColor: groove }} />
            <View
              style={{
                position: "absolute",
                left: 0,
                width: progress,
                height: TRACK,
                borderRadius: TRACK,
                backgroundColor: colors.accent,
              }}
            />
            {LEVELS.map((step, stepIndex) => {
              const passed = stepIndex <= index;
              return (
                <View
                  key={step}
                  style={{
                    position: "absolute",
                    left: `${(stepIndex / (LEVELS.length - 1)) * 100}%`,
                    width: 2,
                    height: 12,
                    marginLeft: -1,
                    borderRadius: 1,
                    backgroundColor: passed ? colors.accent : tick,
                  }}
                />
              );
            })}
          </View>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: THUMB / 2,
              right: THUMB / 2,
              top: 0,
              bottom: 0,
              justifyContent: "center",
            }}
          >
            <View
              style={{
                position: "absolute",
                left: progress,
                width: THUMB,
                height: THUMB,
                marginLeft: -THUMB / 2,
                borderRadius: THUMB / 2,
                backgroundColor: colors.white,
                borderWidth: 2,
                borderColor: colors.accent,
                shadowColor: "#000000",
                shadowOpacity: scheme === "dark" ? 0.45 : 0.16,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
                elevation: 4,
              }}
            />
          </View>
        </View>
        <Text
          allowFontScaling={false}
          style={{
            fontFamily: appFont.semibold,
            fontSize: 28,
            lineHeight: 34,
            color: colors.ink,
            width: 28,
            textAlign: "center",
          }}
        >
          A
        </Text>
      </View>
      <Text
        allowFontScaling={false}
        style={{
          marginTop: 2,
          textAlign: "center",
          fontFamily: appFont.medium,
          fontSize: 12,
          color: colors.muted,
        }}
      >
        {labels[level]}
      </Text>
    </View>
  );
}
