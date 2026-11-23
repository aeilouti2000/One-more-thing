import { caretColors, caretGap } from "@/constants/text";
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { AppText } from "@/components/ui/AppText";
import { ToastMessage } from "@/components/ui/ToastMessage";
import { HomeIcon } from "@/components/ui/HomeIcon";
import { IconSheet } from "@/components/ui/IconSheet";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { appFont, scaleFontSize, singleLineInput } from "@/constants/font";
import { cardLift, tabBar, withAlpha } from "@/constants/theme";
import { RequireSession } from "@/features/auth/components/require-session";
import { resolveIcon } from "@/features/icons/resolve";
import { useHomeIcons, useLoadIcons } from "@/features/icons/use-icons";
import { useCategories, useCategoryLabel } from "@/features/items/providers/categories-provider";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
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
  const { colors, glass, scheme } = useTheme();
  const { scale } = useFontScale();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const { categories, addCategory, removeCategory } = useCategories();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canAdd = Boolean(draft.trim()) && !busy;
  const dark = scheme === "dark";
  const inputSize = scaleFontSize(Number(singleLineInput.fontSize), scale);
  const [iconFor, setIconFor] = useState<{ id: string; name: string } | null>(null);
  // Icons can change on another phone: load them each time this screen opens.
  useLoadIcons(true);

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
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("categories")}
        subtitle={t("categoriesSettingsBody")}
        showBack={showBack}
        splitJoin={splitJoin}
      />
      <ToastMessage message={error} />

      <View
        className="mb-4 overflow-hidden rounded-3xl"
        style={{
          backgroundColor: dark ? colors.paper : colors.mist,
          borderWidth: tabBar.borderWidth,
          borderColor: withAlpha(
            focused ? colors.accentText : dark ? colors.muted : colors.accentText,
            focused ? 0.55 : 0.28,
          ),
          shadowColor: dark ? "#000000" : colors.ink,
          shadowOpacity: dark ? 0.36 : 0.1,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 3 },
          ...cardLift(glass, 1),
        }}
      >
        <View className="flex-row items-center gap-2.5 px-3.5 py-2.5">
          <View
            className="h-9 w-9 items-center justify-center rounded-2xl"
            style={{ backgroundColor: withAlpha(colors.accentText, dark ? 0.22 : 0.14) }}
          >
            <Ionicons name="grid-outline" size={17} color={colors.accentText} />
          </View>
          <TextInput
            maxLength={40}
            value={draft}
            onChangeText={setDraft}
            placeholder={caretGap(t("newCategoryPlaceholder"))}
            {...caretColors(colors.accentText)}
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
                : withAlpha(colors.accentText, dark ? 0.35 : 0.28),
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
              onChangeIcon={(name) => setIconFor({ id: item.id, name })}
              accent={colors.accent}
              muted={colors.muted}
              ink={colors.ink}
              dark={dark}
              glass={glass}
            />
          ))}
      </View>
      <IconSheet
        target={iconFor ? { kind: "category", key: iconFor.id } : null}
        title={iconFor?.name ?? ""}
        onClose={() => setIconFor(null)}
      />
    </Screen>
  );
}

function CategoryRow({
  item,
  removing,
  disabled,
  onDelete,
  onChangeIcon,
  accent,
  muted,
  ink,
  dark,
  glass,
}: {
  item: HomeCategory;
  removing: boolean;
  disabled: boolean;
  onDelete?: () => void;
  /** Opens the icon sheet; gets the name as shown. */
  onChangeIcon: (name: string) => void;
  accent: string;
  muted: string;
  ink: string;
  dark: boolean;
  /** The glass theme is on: the card is see-through and casts no shadow. */
  glass: boolean;
}) {
  const { t } = useI18n();
  const label = useCategoryLabel(item.id);
  const name = item.builtin ? label : item.name ?? item.id;
  const icon = resolveIcon(useHomeIcons(), "category", item.id);
  const { colors } = useTheme();

  return (
    <View
      className="flex-row items-center gap-3 rounded-3xl bg-cove-paper px-3.5 py-3.5"
      style={{
        shadowColor: dark ? "#000000" : ink,
        shadowOpacity: dark ? 0.28 : 0.08,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
        ...cardLift(glass, 2),
      }}
    >
      <Pressable
        onPress={() => onChangeIcon(name)}
        accessibilityRole="button"
        accessibilityLabel={`${t("iconChange")}, ${name}`}
        hitSlop={6}
        className="active:opacity-75"
      >
        <HomeIcon kind="category" id={item.id} size={40} />
        <View
          pointerEvents="none"
          className="absolute h-[18px] w-[18px] items-center justify-center rounded-full bg-cove-accent"
          style={{ end: -4, bottom: -4, borderWidth: 2, borderColor: colors.paper }}
        >
          <Ionicons name="pencil" size={9} color={colors.onAccent} />
        </View>
      </Pressable>
      <View className="min-w-0 flex-1">
        <AppText numberOfLines={1} className="text-base font-semibold text-cove-ink">
          {name}
        </AppText>
        <AppText numberOfLines={1} className="mt-0.5 text-xs text-cove-muted">
          {icon.type === "image"
            ? t("iconChosenImage")
            : icon.chosen
              ? t("iconChosenEmoji")
              : t("iconDefault")}
        </AppText>
      </View>
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
