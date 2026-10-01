import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, FrostedFill, GlassFill } from "@/components/ui/BlurBackdrop";
import { FormMessage } from "@/components/ui/FormMessage";
import { singleLineInput } from "@/constants/font";
import { iconSize } from "@/constants/theme";
import { useCategories, useCategoryLabel } from "@/providers/CategoriesProvider";
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
  const { t, isRTL } = useI18n();
  const { colors } = useTheme();
  const { categories, addCategory, removeCategory } = useCategories();
  const selectedLabel = useCategoryLabel(value === "all" ? "" : value);
  const filtered = value !== "all";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: PurchaseCategory | "all") {
    onChange(next);
    onClose();
  }

  async function add() {
    const name = draft.trim();
    if (!name || busy) return;
    setBusy(true);
    setError(null);
    const message = await addCategory(name);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setDraft("");
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const message = await removeCategory(id);
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    if (value === id) onChange("all");
  }

  return (
    <>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={
          filtered ? `${t("categories")}, ${selectedLabel}` : t("categories")
        }
        className="min-h-[76px] flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-3xl border border-cove-line px-1 py-2 active:opacity-80"
      >
        <FrostedFill />
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: filtered ? colors.accent : colors.mist }}
        >
          <Ionicons
            name="chevron-down"
            size={20}
            color={filtered ? colors.white : colors.accent}
          />
        </View>
        <AppText
          numberOfLines={1}
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
          <BlurBackdrop onPress={onClose} />
          <View className="max-h-[80%] w-full max-w-md gap-2 overflow-hidden rounded-3xl border border-cove-line p-4">
            <GlassFill soft />
            <AppText className="px-2 pb-1 text-base font-semibold" style={{ color: colors.ink }}>
              {t("categories")}
            </AppText>
            <ScrollView keyboardShouldPersistTaps="handled" className="grow-0">
              <CategoryOption
                label={t("all")}
                selected={value === "all"}
                onPress={() => choose("all")}
              />
              {categories.map((item) => (
                <CategoryOption
                  key={item.id}
                  label={item.builtin ? undefined : item.name ?? item.id}
                  category={item.builtin ? item.id : undefined}
                  selected={value === item.id}
                  onPress={() => choose(item.id)}
                  onDelete={item.id === "other" ? undefined : () => void remove(item.id)}
                />
              ))}
            </ScrollView>
            <FormMessage message={error} />
            <View className="flex-row items-center gap-2">
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t("newCategoryPlaceholder")}
                placeholderTextColor={colors.muted}
                textAlign={isRTL ? "right" : "left"}
                textAlignVertical="center"
                allowFontScaling={false}
                onSubmitEditing={() => void add()}
                style={singleLineInput}
                className="h-11 min-w-0 flex-1 rounded-2xl border border-cove-line bg-cove-ice px-3 text-cove-ink"
              />
              <Pressable
                onPress={() => void add()}
                disabled={!draft.trim() || busy}
                accessibilityRole="button"
                accessibilityLabel={t("addCategory")}
                className={`h-11 w-11 items-center justify-center rounded-2xl bg-cove-accent ${
                  !draft.trim() || busy ? "opacity-45" : "active:opacity-80"
                }`}
              >
                <Ionicons name="add" size={22} color={colors.white} />
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CategoryOption({
  label,
  category,
  selected,
  onPress,
  onDelete,
}: {
  label?: string;
  category?: string;
  selected: boolean;
  onPress: () => void;
  onDelete?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const resolved = useCategoryLabel(category ?? "");
  const text = label ?? resolved;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center justify-between rounded-2xl px-3 py-3 active:opacity-80"
      style={{ backgroundColor: selected ? colors.accent : "transparent" }}
    >
      <AppText
        className="min-w-0 flex-1 text-sm font-medium"
        style={{ color: selected ? colors.white : colors.ink }}
      >
        {text}
      </AppText>
      <View className="flex-row items-center gap-2">
        {onDelete ? (
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={t("deleteCategory")}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center active:opacity-80"
          >
            <Ionicons name="trash-outline" size={18} color={selected ? colors.white : colors.muted} />
          </Pressable>
        ) : null}
        {selected ? <Ionicons name="checkmark" size={iconSize.sm} color={colors.white} /> : null}
      </View>
    </Pressable>
  );
}
