import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { useCategories, useCategoryLabel } from "@/providers/CategoriesProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { PurchaseCategory } from "@/types/purchase";

type CategoryFieldProps = {
  value: PurchaseCategory;
  onChange: (category: PurchaseCategory) => void;
};

export function CategoryField({ value, onChange }: CategoryFieldProps) {
  const { t } = useI18n();
  const { categories } = useCategories();
  const selectedLabel = useCategoryLabel(value);
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <View className="gap-1.5">
        <AppText className="text-xs font-medium text-cove-muted">{t("category")}</AppText>
        <Pressable
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          className="h-10 flex-row items-center justify-between rounded-2xl border border-cove-line bg-cove-paper px-3 active:opacity-80"
        >
          <AppText className="text-sm font-medium text-cove-ink">
            {selectedLabel}
          </AppText>
          <Ionicons name="chevron-down" size={16} color={colors.muted} />
        </Pressable>
      </View>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1 items-center justify-center px-6">
          <BlurBackdrop onPress={() => setOpen(false)} />
          <View className="w-full max-w-md gap-1 overflow-hidden rounded-3xl border border-cove-line p-3">
            <GlassFill />
            <AppText className="px-2 pb-1 text-base font-semibold text-cove-ink">{t("category")}</AppText>
            {categories.map((item) => {
              const selected = item.id === value;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="flex-row items-center justify-between rounded-2xl px-3 py-3 active:opacity-80"
                  style={{ backgroundColor: selected ? colors.accent : "transparent" }}
                >
                  <CategoryChoice
                    id={item.id}
                    name={item.builtin ? null : item.name}
                    selected={selected}
                  />
                  {selected ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

function CategoryChoice({
  id,
  name,
  selected,
}: {
  id: string;
  name: string | null;
  selected: boolean;
}) {
  const { colors } = useTheme();
  const label = useCategoryLabel(name ? "" : id);

  return (
    <AppText className="text-sm font-medium" style={{ color: selected ? colors.white : colors.ink }}>
      {name ?? label}
    </AppText>
  );
}
