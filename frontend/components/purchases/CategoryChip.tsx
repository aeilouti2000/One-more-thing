import { Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useCategoryLabel } from "@/providers/CategoriesProvider";
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
  const { locale } = useI18n();
  const { colors } = useTheme();
  const categoryLabel = useCategoryLabel(category ?? "");
  const text = label ?? (category ? categoryLabel : "");

  return (
    <Pressable
      onPress={onPress}
      className={dense ? "rounded-full px-2.5 py-1" : "rounded-full px-4 py-2"}
      style={{ backgroundColor: selected ? colors.accent : colors.paper }}
    >
      <AppText
        key={locale}
        className={dense ? "text-xs font-medium" : "text-sm font-medium"}
        style={{ color: selected ? colors.onAccent : colors.ink }}
      >
        {text}
      </AppText>
    </Pressable>
  );
}
