import { Pressable, View } from "react-native";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type UrgentToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
};

export function UrgentToggle({ value, onValueChange }: UrgentToggleProps) {
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <View className="items-start">
      <SectionHeader title={t("urgent")} />
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={t("urgent")}
        onPress={() => onValueChange(!value)}
        className="h-7 w-12 justify-center rounded-full px-0.5"
        style={{ backgroundColor: value ? colors.accent : colors.line }}
      >
        <View
          className="h-6 w-6 rounded-full"
          style={{
            backgroundColor: colors.white,
            alignSelf: value ? "flex-end" : "flex-start",
          }}
        />
      </Pressable>
    </View>
  );
}
