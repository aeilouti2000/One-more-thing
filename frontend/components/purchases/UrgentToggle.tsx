import { Pressable, View } from "react-native";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type UrgentToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
};

export function UrgentToggle({ value, onValueChange, label }: UrgentToggleProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const title = label ?? t("urgent");

  return (
    <View className="items-start">
      <SectionHeader title={title} />
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={title}
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
