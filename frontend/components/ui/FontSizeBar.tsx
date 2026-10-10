import { Pressable, Text, View } from "react-native";
import { appFont, type FontScaleLevel } from "@/constants/font";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const LEVELS: { id: FontScaleLevel; sample: number }[] = [
  { id: "small", sample: 13 },
  { id: "medium", sample: 16 },
  { id: "large", sample: 20 },
  { id: "xl", sample: 26 },
];

export function FontSizeBar() {
  const { level, setLevel } = useFontScale();
  const { t } = useI18n();
  const { colors } = useTheme();
  const labels = {
    small: t("textSizeSmall"),
    medium: t("textSizeMedium"),
    large: t("textSizeLarge"),
    xl: t("textSizeXl"),
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
            className={`min-w-0 flex-1 items-center justify-end rounded-2xl px-1 py-2.5 active:opacity-80 ${
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
