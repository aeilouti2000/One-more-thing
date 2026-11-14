import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useCategoryLabeler } from "@/features/items/providers/categories-provider";
import { formatMoney } from "@/features/items/utils/currency";
import type { ItemSuggestion } from "@/features/items/utils/insights";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * Things bought before that match what's being typed in the add bar. One tap
 * puts the item back on the list with the category it had last time.
 */
export function ItemSuggestions({
  suggestions,
  currency,
  showPrices,
  disabled,
  onPick,
}: {
  suggestions: ItemSuggestion[];
  currency: string;
  showPrices: boolean;
  disabled?: boolean;
  onPick: (suggestion: ItemSuggestion) => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const categoryLabel = useCategoryLabeler();
  if (suggestions.length === 0) return null;

  return (
    <View
      className="overflow-hidden rounded-3xl bg-cove-paper"
      accessibilityRole="list"
      accessibilityLabel={t("suggestionsTitle")}
    >
      <AppText className="px-4 pb-1 pt-3 text-xs font-semibold text-cove-muted">
        {t("suggestionsTitle")}
      </AppText>
      {suggestions.map((suggestion, index) => {
        const detail = [
          categoryLabel(suggestion.category),
          showPrices && suggestion.lastCost !== null
            ? formatMoney(suggestion.lastCost, currency)
            : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Pressable
            key={suggestion.name}
            disabled={disabled}
            onPress={() => onPick(suggestion)}
            accessibilityRole="button"
            accessibilityLabel={`${t("addItem")}: ${suggestion.name}, ${detail}`}
            className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
            style={{
              borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
              borderTopColor: colors.line,
            }}
          >
            <Ionicons name="time-outline" size={18} color={colors.muted} />
            <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink" numberOfLines={1}>
              {suggestion.name}
            </AppText>
            <AppText className="text-sm text-cove-muted" numberOfLines={1}>
              {detail}
            </AppText>
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
          </Pressable>
        );
      })}
    </View>
  );
}
