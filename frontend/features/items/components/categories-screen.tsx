import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RequireSession } from "@/features/auth/components/require-session";
import { useCategories, useCategoryLabel } from "@/features/items/providers/categories-provider";
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
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const { categories, addCategory, removeCategory } = useCategories();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = Boolean(draft.trim()) && !busy;

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

      <View className="mb-4 gap-3 rounded-3xl bg-cove-paper px-3.5 py-3.5">
        <AppTextField
          label={t("addCategory")}
          value={draft}
          onChangeText={setDraft}
          placeholder={t("newCategoryPlaceholder")}
          editable={!busy}
        />
        <AppButton
          label={t("addCategory")}
          disabled={!canAdd}
          loading={busy}
          onPress={() => void add()}
        />
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
            dark={scheme === "dark"}
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
