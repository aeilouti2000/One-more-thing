import { Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { categoryKeys } from "@/constants/categories";
import { useI18n } from "@/providers/LanguageProvider";
import type { PurchaseCategory } from "@/types/purchase";

type CategoryChipProps = {
  category?: PurchaseCategory;
  label?: string;
  selected?: boolean;
  onPress?: () => void;
};

export function CategoryChip({
  category,
  label,
  selected = false,
  onPress,
}: CategoryChipProps) {
  const { t, locale } = useI18n();
  const text = label ?? (category ? t(categoryKeys[category]) : "");

  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-4 py-2 ${
        selected ? "bg-cove-accent" : "bg-cove-paper"
      }`}
    >
      <AppText
        key={locale}
        className={`text-sm font-medium ${
          selected ? "text-white" : "text-cove-ink"
        }`}
      >
        {text}
      </AppText>
    </Pressable>
  );
}
