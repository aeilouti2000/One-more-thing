import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { Dimensions, Modal, Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { useCategories, useCategoryLabel } from "@/providers/CategoriesProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { glassFieldStyle } from "@/constants/theme";
import type { PurchaseCategory } from "@/types/purchase";

type Anchor = { x: number; y: number; width: number; height: number };

type CategoryFieldProps = {
  value: PurchaseCategory;
  onChange: (category: PurchaseCategory) => void;
  glass?: boolean;
};

export function CategoryField({ value, onChange, glass = false }: CategoryFieldProps) {
  const { t } = useI18n();
  const { categories } = useCategories();
  const selectedLabel = useCategoryLabel(value);
  const { colors, scheme, shadow } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const fieldRef = useRef<View>(null);
  const frame = categoryMenuFrame(anchor, categories.length);

  function openMenu() {
    const node = fieldRef.current;
    if (!node) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }

  return (
    <>
      <View className="gap-1.5">
        <AppText className="text-xs font-medium text-cove-muted">{t("category")}</AppText>
        <View ref={fieldRef} collapsable={false}>
          <Pressable
            onPress={openMenu}
            accessibilityRole="button"
            className={`h-10 flex-row items-center justify-between rounded-2xl border px-3 active:opacity-80 ${
              glass ? "" : "border-cove-line bg-cove-paper"
            }`}
            style={glass ? glassFieldStyle(scheme, colors) : undefined}
          >
            <AppText className="text-sm font-medium text-cove-ink">
              {selectedLabel}
            </AppText>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </Pressable>
        </View>
      </View>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setOpen(false)}
      >
        <View className="flex-1">
          <BlurBackdrop onPress={() => setOpen(false)} />
          <View
            className="absolute"
            style={{
              top: frame.top,
              left: frame.left,
              width: frame.width,
              borderRadius: 24,
              shadowColor: shadow.color,
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.16,
              shadowRadius: 16,
              elevation: 8,
            }}
          >
            <View
              className="overflow-hidden rounded-3xl border border-cove-line"
              style={{ maxHeight: frame.maxHeight }}
            >
              <GlassFill soft />
              <ScrollView
                bounces={false}
                style={{ flexGrow: 0, maxHeight: frame.maxHeight }}
                contentContainerStyle={{ gap: 4, padding: 8 }}
              >
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
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function categoryMenuFrame(anchor: Anchor | null, optionCount: number) {
  const screen = Dimensions.get("window");
  const gap = 8;
  const estimated = Math.min(optionCount * 48 + 16, screen.height * 0.55);
  if (!anchor) {
    const width = screen.width - 32;
    return { top: 96, left: 16, width, maxHeight: estimated };
  }

  const width = Math.min(Math.max(anchor.width, 180), screen.width - 32);
  const left = Math.max(16, Math.min(anchor.x, screen.width - width - 16));
  const spaceBelow = screen.height - (anchor.y + anchor.height + gap) - 16;
  const spaceAbove = anchor.y - gap - 16;
  const openUp = spaceBelow < Math.min(estimated, 220) && spaceAbove > spaceBelow;
  const maxHeight = Math.max(160, Math.min(estimated, openUp ? spaceAbove : spaceBelow));
  const top = openUp
    ? Math.max(16, anchor.y - gap - maxHeight)
    : anchor.y + anchor.height + gap;

  return { top, left, width, maxHeight };
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
