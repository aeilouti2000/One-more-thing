import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { LOCALES } from "@/constants/i18n";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type LanguagePickerProps = {
  size?: "regular" | "compact";
};

export function LanguagePicker({ size = "regular" }: LanguagePickerProps) {
  const { locale, setLocale, t } = useI18n();
  const { colors } = useTheme();
  const compact = size === "compact";

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t("languageLabel")}
      className={`flex-row gap-2 ${compact ? "justify-center" : ""}`}
    >
      {LOCALES.map((option) => {
        const selected = locale === option.id;

        return (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setLocale(option.id)}
            className={`items-center active:opacity-80 ${
              compact ? "rounded-full px-4 py-1.5" : "flex-1 rounded-2xl px-4 py-3"
            } ${selected ? "bg-cove-accent" : "bg-cove-paper"}`}
          >
            <AppText
              className={`font-semibold ${compact ? "text-sm" : "text-base"} ${
                selected ? "" : "text-cove-ink"
              }`}
              style={selected ? { color: colors.onAccent } : undefined}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
