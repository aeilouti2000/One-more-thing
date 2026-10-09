import { Pressable, Text, View } from "react-native";
import { appFont, type FontScaleLevel } from "@/constants/font";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const LEVELS: { id: FontScaleLevel; sample: number }[] = [
  { id: "small", sample: 14 },
  { id: "medium", sample: 18 },
  { id: "large", sample: 24 },
];

export function FontSizeBar() {
  const { level, setLevel } = useFontScale();
  const { t } = useI18n();
  const { colors } = useTheme();
  const labels = {
    small: t("textSizeSmall"),
    medium: t("textSizeMedium"),
    large: t("textSizeLarge"),
  } as const;

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("textSize")}
      className="w-full flex-row items-end gap-2"
      style={{ direction: "ltr" }}
    >
      {LEVELS.map((option) => {
        const selected = level === option.id;
        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityLabel={labels[option.id]}
            accessibilityState={{ selected }}
            onPress={() => setLevel(option.id)}
            className={`flex-1 items-center justify-end rounded-2xl px-3.5 py-2.5 active:opacity-80 ${
              selected ? "bg-cove-accent" : "bg-cove-paper"
            }`}
          >
            <Text
              allowFontScaling={false}
              style={{
                fontFamily: appFont.semibold,
                fontSize: option.sample,
                lineHeight: option.sample + 6,
                color: selected ? colors.onAccent : colors.ink,
              }}
            >
              A
            </Text>
            <Text
              allowFontScaling={false}
              style={{
                marginTop: 2,
                fontFamily: appFont.medium,
                fontSize: 12,
                lineHeight: 16,
                color: selected ? colors.onAccent : colors.muted,
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
