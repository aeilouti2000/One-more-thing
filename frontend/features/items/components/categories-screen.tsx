import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { appFont, scaleFontSize, singleLineInput } from "@/constants/font";
import { tabBar, withAlpha } from "@/constants/theme";
import { RequireSession } from "@/features/auth/components/require-session";
import { useCategories, useCategoryLabel } from "@/features/items/providers/categories-provider";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { HomeCategory } from "@/features/items/api/categories";

export default function CategoriesScreen() {
  return (
    <RequireSession requireHome>
      <CategoriesBody />
    </RequireSession>
  );
}

function CategoriesBody() {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const { scale } = useFontScale();
  const { categories, addCategory, removeCategory } = useCategories();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = Boolean(draft.trim()) && !busy;
  const dark = scheme === "dark";
  const inputSize = scaleFontSize(Number(singleLineInput.fontSize), scale);

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
    if (busy || removingId) return;
    setRemovingId(id);
    setError(null);
    const message = await removeCategory(id);
    setRemovingId(null);
    if (message) setError(message);
  }

  return (
    <Screen>
      <ScreenHeader title={t("categories")} subtitle={t("categoriesSettingsBody")} showBack />
      <FormMessage message={error} />

      <View
        className="mb-4 overflow-hidden rounded-3xl"
        style={{
          backgroundColor: dark ? colors.paper : colors.mist,
          borderWidth: tabBar.borderWidth,
          borderColor: withAlpha(
            focused ? colors.accent : dark ? colors.muted : colors.accent,
            focused ? 0.55 : 0.28,
          ),
          shadowColor: dark ? "#000000" : colors.ink,
          shadowOpacity: dark ? 0.36 : 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 3 },
          elevation: 1,
        }}
      >
        <View className="flex-row items-center gap-2.5 px-3.5 py-2.5">
          <View
            className="h-9 w-9 items-center justify-center rounded-2xl"
            style={{ backgroundColor: withAlpha(colors.accent, dark ? 0.22 : 0.14) }}
          >
            <Ionicons name="pricetag-outline" size={17} color={colors.accent} />
          </View>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t("newCategoryPlaceholder")}
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => void add()}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            returnKeyType="done"
            editable={!busy}
            autoCapitalize="sentences"
            textAlign={isRTL ? "right" : "left"}
            textAlignVertical="center"
            allowFontScaling={false}
            accessibilityLabel={t("newCategoryPlaceholder")}
            className="h-11 min-w-0 flex-1 text-cove-ink"
            style={{
              ...singleLineInput,
              fontFamily: appFont.medium,
              fontSize: inputSize,
              color: colors.ink,
            }}
          />
          <Pressable
            disabled={!canAdd}
            onPress={() => void add()}
            accessibilityRole="button"
            accessibilityLabel={t("addCategory")}
            accessibilityState={{ disabled: !canAdd, busy }}
            className={`h-9 w-9 items-center justify-center rounded-full ${
              canAdd ? "active:opacity-80" : ""
            }`}
            style={{
              backgroundColor: canAdd
                ? colors.accent
                : withAlpha(colors.accent, dark ? 0.35 : 0.28),
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} size="small" />
            ) : (
              <Ionicons name="add" size={20} color={colors.onAccent} />
            )}
          </Pressable>
        </View>
      </View>

      <View className="mb-6 gap-3">
        {[...categories]
          .sort((a, b) => (a.id === "other" ? 1 : b.id === "other" ? -1 : 0))
          .map((item) => (
            <CategoryRow
              key={item.id}
              item={item}
              removing={removingId === item.id}
              disabled={busy || removingId != null}
              onDelete={item.id === "other" ? undefined : () => void remove(item.id)}
              accent={colors.accent}
              muted={colors.muted}
              ink={colors.ink}
              dark={dark}
            />
          ))}
      </View>
    </Screen>
  );
}

function CategoryRow({
  item,
  removing,
  disabled,
  onDelete,
  accent,
  muted,
  ink,
  dark,
}: {
  item: HomeCategory;
  removing: boolean;
  disabled: boolean;
  onDelete?: () => void;
  accent: string;
  muted: string;
  ink: string;
  dark: boolean;
}) {
  const { t } = useI18n();
  const label = useCategoryLabel(item.id);
  const name = item.builtin ? label : item.name ?? item.id;

  return (
    <View
      className="flex-row items-center gap-3 rounded-3xl bg-cove-paper px-3.5 py-3.5"
      style={{
        shadowColor: dark ? "#000000" : ink,
        shadowOpacity: dark ? 0.28 : 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
    >
      <Ionicons name="pricetag-outline" size={18} color={accent} />
      <AppText numberOfLines={1} className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
        {name}
      </AppText>
      <View className="h-9 w-9 items-center justify-center">
        {onDelete ? (
          <Pressable
            disabled={disabled}
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel={t("deleteCategory")}
            className={`h-9 w-9 items-center justify-center rounded-full ${
              disabled ? "opacity-45" : "active:opacity-80"
            }`}
          >
            {removing ? (
              <ActivityIndicator color="#F87171" size="small" />
            ) : (
              <Ionicons name="trash-outline" size={18} color={muted} />
            )}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
