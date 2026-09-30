import { Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { categoryKeys } from "@/constants/categories";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { PurchaseCategory } from "@/types/purchase";

type CategoryChipProps = {
  category?: PurchaseCategory;
  label?: string;
  selected?: boolean;
  onPress?: () => void;
  dense?: boolean;
};

export function CategoryChip({
  category,
  label,
  selected = false,
  onPress,
  dense = false,
}: CategoryChipProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const text = label ?? (category ? t(categoryKeys[category]) : "");

  return (
    <Pressable
      onPress={onPress}
      className={dense ? "rounded-full px-2.5 py-1" : "rounded-full px-4 py-2"}
      style={{ backgroundColor: selected ? colors.accent : colors.paper }}
    >
      <AppText
        key={locale}
        className={dense ? "text-xs font-medium" : "text-sm font-medium"}
        style={{ color: selected ? colors.white : colors.ink }}
      >
        {text}
      </AppText>
    </Pressable>
  );
}
