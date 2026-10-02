import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, FrostedFill, GlassFill } from "@/components/ui/BlurBackdrop";
import { FormMessage } from "@/components/ui/FormMessage";
import { singleLineInput } from "@/constants/font";
import { glassFieldStyle, iconSize, withAlpha } from "@/constants/theme";
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
  const { colors, scheme, shadow } = useTheme();
  const { categories, addCategory, removeCategory } = useCategories();
  const selectedLabel = useCategoryLabel(value === "all" ? "" : value);
  const filtered = value !== "all";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAdd = Boolean(draft.trim()) && !busy;
  const fieldStyle = glassFieldStyle(scheme, colors);
  const dark = scheme === "dark";
  const cardShadow = {
    shadowColor: shadow.color,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: dark ? 0.45 : shadow.opacity,
    shadowRadius: 16,
    elevation: 8,
  };

  useEffect(() => {
    if (!open) {
      setDraft("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

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
          style={{
            backgroundColor: filtered
              ? colors.accent
              : scheme === "dark"
                ? colors.soft
                : colors.mist,
          }}
        >
          <Ionicons
            name="chevron-down"
            size={20}
            color={filtered ? colors.onAccent : colors.accent}
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
          <View className="max-h-[80%] w-full max-w-md" style={[{ borderRadius: 28 }, cardShadow]}>
            <View className="overflow-hidden rounded-[28px] border border-cove-line">
              <GlassFill soft />

              <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
                <AppText className="text-lg font-semibold" style={{ color: colors.ink }}>
                  {t("categories")}
                </AppText>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={t("cancel")}
                  hitSlop={10}
                  className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
                  style={{
                    backgroundColor: dark
                      ? "rgba(227, 242, 253, 0.08)"
                      : "rgba(13, 71, 161, 0.06)",
                  }}
                >
                  <Ionicons name="close" size={18} color={colors.muted} />
                </Pressable>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                className="grow-0"
                contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, gap: 4 }}
              >
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

              <View
                className="gap-2.5 border-t px-4 pb-4 pt-3"
                style={{
                  borderTopColor: withAlpha(dark ? colors.muted : colors.accent, dark ? 0.16 : 0.14),
                }}
              >
                <FormMessage message={error} />
                <View
                  className="flex-row items-center gap-2 rounded-2xl border px-2 py-1.5"
                  style={fieldStyle}
                >
                  <View
                    className="h-8 w-8 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: withAlpha(colors.accent, dark ? 0.16 : 0.1),
                    }}
                  >
                    <Ionicons name="pricetag-outline" size={15} color={colors.accent} />
                  </View>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder={t("newCategoryPlaceholder")}
                    placeholderTextColor={
                      dark ? withAlpha(colors.muted, 0.55) : colors.line
                    }
                    textAlign={isRTL ? "right" : "left"}
                    textAlignVertical="center"
                    allowFontScaling={false}
                    onSubmitEditing={() => void add()}
                    style={[singleLineInput, { color: colors.ink, flex: 1, minWidth: 0 }]}
                    className="h-10 px-1"
                  />
                  <Pressable
                    onPress={() => void add()}
                    disabled={!canAdd}
                    accessibilityRole="button"
                    accessibilityLabel={t("addCategory")}
                    className="h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: canAdd ? colors.accent : colors.mist,
                      opacity: canAdd ? 1 : 0.55,
                    }}
                  >
                    <Ionicons
                      name="add"
                      size={22}
                      color={canAdd ? colors.onAccent : colors.muted}
                    />
                  </Pressable>
                </View>
              </View>
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
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const resolved = useCategoryLabel(category ?? "");
  const text = label ?? resolved;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className="flex-row items-center gap-2 rounded-2xl px-3 py-2.5 active:opacity-80"
      style={{
        backgroundColor: selected
          ? colors.accent
          : scheme === "dark"
            ? "rgba(227, 242, 253, 0.04)"
            : "rgba(13, 71, 161, 0.03)",
      }}
    >
      <AppText
        className="min-w-0 flex-1 text-sm font-medium"
        style={{ color: selected ? colors.onAccent : colors.ink }}
      >
        {text}
      </AppText>
      <View className="flex-row items-center gap-1">
        {onDelete ? (
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={t("deleteCategory")}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-xl active:opacity-80"
            style={{
              backgroundColor: selected
                ? "rgba(255, 255, 255, 0.16)"
                : scheme === "dark"
                  ? "rgba(248, 113, 113, 0.12)"
                  : "rgba(248, 113, 113, 0.1)",
            }}
          >
            <Ionicons
              name="trash-outline"
              size={15}
              color={selected ? colors.onAccent : "#F87171"}
            />
          </Pressable>
        ) : null}
        {selected ? (
          <View className="h-8 w-8 items-center justify-center">
            <Ionicons name="checkmark" size={iconSize.sm} color={colors.onAccent} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
