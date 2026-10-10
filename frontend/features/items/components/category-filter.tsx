import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FrostedFill } from "@/components/ui/BlurBackdrop";
import { FormMessage } from "@/components/ui/FormMessage";
import { singleLineInput } from "@/constants/font";
import { floatedCardStyle, glassFieldStyle, withAlpha } from "@/constants/theme";
import { useCategories, useCategoryLabel } from "@/features/items/providers/categories-provider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { PurchaseCategory } from "@/features/items/types/purchase";

type Anchor = { x: number; y: number; width: number; height: number };

type CategoryFilterProps = {
  value: PurchaseCategory | "all";
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChange: (category: PurchaseCategory | "all") => void;
  anchor?: Anchor | null;
  layout?: "tile" | "bar" | "none";
  manage?: boolean;
  includeAll?: boolean;
  selectable?: boolean;
};

export function CategoryFilter({
  value,
  open,
  onOpen,
  onClose,
  onChange,
  anchor = null,
  layout = "tile",
  manage = true,
  includeAll = true,
  selectable = true,
}: CategoryFilterProps) {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const { categories, addCategory, removeCategory } = useCategories();
  const triggerRef = useRef<View>(null);
  const [selfAnchor, setSelfAnchor] = useState<Anchor | null>(null);
  const selectedLabel = useCategoryLabel(value === "all" ? "" : value);
  const filtered = value !== "all";
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (open !== trackedOpen) {
    setTrackedOpen(open);
    if (!open) {
      setDraft("");
      setError(null);
      setBusy(false);
    }
  }
  const canAdd = Boolean(draft.trim()) && !busy;
  const fieldStyle = glassFieldStyle(scheme, colors);
  const dark = scheme === "dark";
  const ordered = [...categories].sort((a, b) =>
    a.id === "other" ? 1 : b.id === "other" ? -1 : 0,
  );
  const menuAnchor = anchor ?? selfAnchor;
  const frame = menuFrame(menuAnchor, isRTL);

  function openFromTrigger() {
    const node = triggerRef.current;
    if (!node) {
      onOpen();
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setSelfAnchor({ x, y, width, height });
      onOpen();
    });
  }

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
      {layout === "none" ? null : layout === "bar" ? (
        <Pressable
          ref={triggerRef}
          onPress={openFromTrigger}
          accessibilityRole="button"
          accessibilityLabel={
            filtered ? `${t("categories")}, ${selectedLabel}` : t("categories")
          }
          className="h-14 flex-row items-center gap-2 overflow-hidden rounded-3xl border border-cove-line px-4 active:opacity-80"
        >
          <FrostedFill />
          <Ionicons name="pricetag-outline" size={18} color={colors.muted} />
          <AppText numberOfLines={1} className="min-w-0 flex-1 text-base text-cove-ink">
            {filtered ? selectedLabel : t("categories")}
          </AppText>
          {filtered ? (
            <Pressable
              onPress={() => onChange("all")}
              accessibilityRole="button"
              accessibilityLabel={t("all")}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
              style={{ backgroundColor: scheme === "dark" ? colors.paper : colors.mist }}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : (
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          )}
        </Pressable>
      ) : (
        <Pressable
          ref={triggerRef}
          onPress={openFromTrigger}
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
            numberOfLines={2}
            className="text-center text-xs font-semibold leading-4 text-cove-ink"
          >
            {filtered ? selectedLabel : t("categories")}
          </AppText>
        </Pressable>
      )}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View className="flex-1" style={{ direction: isRTL ? "rtl" : "ltr" }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            onPress={onClose}
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: "rgba(0, 0, 0, 0.2)",
            }}
          />
          <View
            style={[
              floatedCardStyle(scheme, colors),
              {
                position: "absolute",
                top: frame.top,
                left: frame.left,
                width: frame.width,
                maxHeight: frame.maxHeight,
                borderRadius: 20,
                padding: 6,
              },
            ]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              style={{ flexGrow: 0 }}
              contentContainerStyle={{ gap: 2 }}
            >
              {includeAll ? (
                <CategoryOption
                  label={t("all")}
                  selected={value === "all"}
                  onPress={() => choose("all")}
                />
              ) : null}
              {ordered.map((item) => (
                <CategoryOption
                  key={item.id}
                  label={item.builtin ? undefined : item.name ?? item.id}
                  category={item.builtin ? item.id : undefined}
                  selected={selectable && value === item.id}
                  onPress={selectable ? () => choose(item.id) : undefined}
                  onDelete={
                    manage && item.id !== "other" ? () => void remove(item.id) : undefined
                  }
                />
              ))}
            </ScrollView>

            {manage ? <View className="gap-2.5 px-4 pb-4 pt-3">
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
              </View> : null}
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
  onPress?: () => void;
  onDelete?: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const resolved = useCategoryLabel(category ?? "");
  const text = label ?? resolved;
  const Row = onPress ? Pressable : View;

  return (
    <Row
      onPress={onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityState={onPress ? { selected } : undefined}
      className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${onPress ? "active:opacity-80" : ""}`}
      style={{
        backgroundColor: selected ? withAlpha(colors.accent, 0.16) : "transparent",
      }}
    >
      <AppText
        className={`min-w-0 flex-1 text-base ${selected ? "font-semibold" : "font-medium"} text-cove-ink`}
      >
        {text}
      </AppText>
      {onDelete ? (
        <Pressable
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={t("deleteCategory")}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center active:opacity-70"
        >
          <Ionicons name="trash-outline" size={18} color="#F87171" />
        </Pressable>
      ) : null}
      {selected ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
    </Row>
  );
}

function menuFrame(anchor: Anchor | null, isRTL: boolean) {
  const screen = Dimensions.get("window");
  const width = Math.min(Math.max(anchor?.width ?? 220, 196), screen.width - 32);
  const gap = 8;
  const top = anchor ? anchor.y + anchor.height + gap : 96;
  const start = anchor ? (isRTL ? anchor.x + anchor.width - width : anchor.x) : 16;
  return {
    top,
    left: Math.max(16, Math.min(start, screen.width - width - 16)),
    width,
    maxHeight: Math.max(180, screen.height - top - 16),
  };
}
