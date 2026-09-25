import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { PURCHASE_CATEGORIES, getCategoryLabel } from "@/constants/categories";
import { iconSize } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { PurchaseCategory } from "@/types/purchase";

type CategoryFilterProps = {
  value: PurchaseCategory | "all";
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (category: PurchaseCategory | "all") => void;
};

export function CategoryFilter({
  value,
  open,
  onOpen,
  onClose,
  onChange,
}: CategoryFilterProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const selectedLabel =
    value === "all" ? t("all") : getCategoryLabel(value, locale);
  const filtered = value !== "all";

  function choose(next: PurchaseCategory | "all") {
    onChange(next);
    onClose();
  }

  return (
    <>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={
          filtered ? `${t("categories")}, ${selectedLabel}` : t("categories")
        }
        className="min-h-[92px] flex-1 items-center justify-center gap-2 rounded-3xl bg-cove-paper px-1 py-3 active:opacity-80"
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: filtered ? colors.accent : colors.mist }}
        >
          <Ionicons
            name="chevron-down"
            size={20}
            color={filtered ? colors.white : colors.accent}
          />
        </View>
        <AppText
          numberOfLines={2}
          className="text-center text-xs font-semibold leading-4 text-cove-ink"
        >
          {filtered ? selectedLabel : t("categories")}
        </AppText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View className="flex-1 items-center justify-center px-6">
          <Pressable
            onPress={onClose}
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          />
          <View
            className="w-full max-w-md gap-2 rounded-3xl p-4"
            style={{ backgroundColor: colors.paper }}
          >
            <AppText
              className="px-2 pb-1 text-base font-semibold"
              style={{ color: colors.ink }}
            >
              {t("categories")}
            </AppText>
            <CategoryOption
              label={t("all")}
              selected={value === "all"}
              onPress={() => choose("all")}
            />
            {PURCHASE_CATEGORIES.map((item) => (
              <CategoryOption
                key={`${item.id}-${locale}`}
                label={getCategoryLabel(item.id, locale)}
                selected={value === item.id}
                onPress={() => choose(item.id)}
              />
            ))}
          </View>
        </View>
      </Modal>
    </>
  );
}

function CategoryOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center justify-between rounded-2xl px-3 py-3 active:opacity-80"
      style={{ backgroundColor: selected ? colors.accent : "transparent" }}
    >
      <AppText
        className="text-sm font-medium"
        style={{ color: selected ? colors.white : colors.ink }}
      >
        {label}
      </AppText>
      {selected ? (
        <Ionicons name="checkmark" size={iconSize.sm} color={colors.white} />
      ) : null}
    </Pressable>
  );
}
