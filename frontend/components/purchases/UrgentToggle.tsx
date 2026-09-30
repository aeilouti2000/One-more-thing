import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type UrgentToggleProps = {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label?: string;
  compact?: boolean;
};

export function UrgentToggle({ value, onValueChange, label, compact = false }: UrgentToggleProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const title = label ?? t("urgent");

  const switchControl = (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      onPress={() => onValueChange(!value)}
      className={`justify-center rounded-full px-0.5 ${compact ? "h-6 w-11" : "h-7 w-12"}`}
      style={{ backgroundColor: value ? colors.accent : colors.line }}
    >
      <View
        className={`rounded-full ${compact ? "h-5 w-5" : "h-6 w-6"}`}
        style={{
          backgroundColor: colors.white,
          alignSelf: value ? "flex-end" : "flex-start",
        }}
      />
    </Pressable>
  );

  if (compact) {
    return (
      <View className="flex-row items-center gap-2">
        <AppText className="text-sm font-medium text-cove-ink">{title}</AppText>
        {switchControl}
      </View>
    );
  }

  return (
    <View className="items-start">
      <SectionHeader title={title} />
      {switchControl}
    </View>
  );
}
