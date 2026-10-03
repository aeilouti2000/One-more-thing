import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Modal, Pressable, TextInput, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { RequireSession } from "@/components/auth/RequireSession";
import { CategoryField } from "@/components/purchases/CategoryField";
import { UrgentToggle } from "@/components/purchases/UrgentToggle";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { BlurBackdrop, FrostedFill, GlassFill } from "@/components/ui/BlurBackdrop";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getCategoryLabel } from "@/constants/categories";
import { scaleFontSize, singleLineInput } from "@/constants/font";
import { floatedCardStyle, withAlpha } from "@/constants/theme";
import { useCategories } from "@/providers/CategoriesProvider";
import { useHousehold } from "@/hooks/useHousehold";
import { addItem, fetchHomeItems, updateItemDetails } from "@/lib/items";
import { emitListChanged } from "@/lib/list-sync";
import { parseQuantity } from "@/lib/validation";
import {
  createStaple,
  deleteStaple,
  fetchStaples,
  STAPLE_INTERVALS,
  type Staple,
  type StapleInterval,
} from "@/lib/staples";
import { useAuth } from "@/providers/AuthProvider";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { TranslationKey } from "@/constants/i18n";
import type { PurchaseCategory } from "@/types/purchase";

const intervalKeys: Record<StapleInterval, TranslationKey> = {
  1: "intervalDay",
  7: "intervalWeek",
  14: "intervalTwoWeeks",
  30: "intervalMonth",
};

const danger = "#F87171";

export default function StaplesScreen() {
  return (
    <RequireSession requireHome>
      <StaplesBody />
    </RequireSession>
  );
}

function StaplesBody() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const { t, locale, isRTL } = useI18n();
  const { categories } = useCategories();
  const { colors, scheme, shadow } = useTheme();
  const dark = scheme === "dark";
  const { scale } = useFontScale();
  const searchInputStyle = {
    ...singleLineInput,
    fontSize: scaleFontSize(Number(singleLineInput.fontSize), scale),
  };

  function categoryName(id: string) {
    const match = categories.find((item) => item.id === id);
    if (match && !match.builtin && match.name) return match.name;
    return getCategoryLabel(id, locale);
  }

  const [staples, setStaples] = useState<Staple[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState<PurchaseCategory>("supermarket");
  const [urgent, setUrgent] = useState(false);
  const [intervalDays, setIntervalDays] = useState<StapleInterval>(7);
  const [addNow, setAddNow] = useState(true);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [listCounts, setListCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    if (!household) {
      setStaples([]);
      setIsLoading(false);
      return;
    }
    const result = await fetchStaples(household.id);
    setStaples(result.staples);
    setError(result.error);
    setIsLoading(false);
  }, [household]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function onSave() {
    if (!household) return;
    const parsed = parseQuantity(quantity);
    if (!name.trim()) {
      setError(t("errorEnterItemName"));
      return;
    }
    if (parsed === null) {
      setQuantityError(t("errorQuantityMin"));
      return;
    }

    setIsSaving(true);
    setError(null);
    const result = await createStaple(household.id, {
      name: name.trim(),
      quantity: parsed,
      category,
      urgent,
      intervalDays,
      addNow,
    });
    setIsSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setName("");
    setQuantity("1");
    setUrgent(false);
    setIsAdding(false);
    await load();
  }

  function closeForm() {
    setIsAdding(false);
    setError(null);
    setQuantityError(undefined);
  }

  function openForm() {
    setError(null);
    setQuantityError(undefined);
    setIsAdding(true);
  }

  async function onAddToList(staple: Staple) {
    if (!household || !user || addingId) return;
    setAddingId(staple.id);
    setError(null);
    const listed = await fetchHomeItems(household.id);
    if (listed.error) {
      setAddingId(null);
      setError(listed.error);
      return;
    }

    const match = listed.items.find(
      (item) =>
        item.status === "needed" &&
        item.name.trim().toLowerCase() === staple.name.trim().toLowerCase(),
    );
    const nextQuantity = match ? match.quantity + staple.quantity : staple.quantity;
    const result = match
      ? await updateItemDetails(match.id, {
          name: match.name,
          quantity: nextQuantity,
          category: match.category,
          urgent: match.urgent,
          notes: match.notes ?? undefined,
        })
      : await addItem({
          homeId: household.id,
          userId: user.id,
          name: staple.name,
          quantity: staple.quantity,
          category: staple.category,
          unit: staple.unit,
          urgent: staple.urgent,
        });

    setAddingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }

    const copies = Math.max(1, Math.round(nextQuantity / staple.quantity));
    setListCounts((current) => ({ ...current, [staple.id]: copies }));
    emitListChanged();
  }

  async function onRemove(id: string) {
    setRemovingId(id);
    setError(null);
    const result = await deleteStaple(id);
    setRemovingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (isLoading && staples.length === 0 && !error) {
    return <LoadingScreen />;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visibleStaples = normalizedQuery
    ? staples.filter((staple) => staple.name.toLowerCase().includes(normalizedQuery))
    : staples;

  return (
    <Screen
      dock={
        <View
          style={{
            borderRadius: 28,
            borderWidth: 1,
            overflow: "hidden",
            borderColor: withAlpha(dark ? colors.muted : colors.accent, 0.34),
            backgroundColor: withAlpha(dark ? colors.deep : colors.mist, dark ? 0.55 : 0.72),
            shadowColor: shadow.color,
            shadowOffset: shadow.offset,
            shadowOpacity: dark ? 0.42 : 0.16,
            shadowRadius: 24,
            elevation: shadow.elevation,
          }}
        >
          <GlassFill soft screenBlur />
          <Pressable
            onPress={openForm}
            accessibilityRole="button"
            accessibilityLabel={t("addStaple")}
            className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
          >
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-cove-accent">
              <MaterialCommunityIcons name="pin" size={20} color={colors.onAccent} />
            </View>
            <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
              {t("addStaple")}
            </AppText>
            <Ionicons
              name={isRTL ? "chevron-back" : "chevron-forward"}
              size={18}
              color={colors.muted}
            />
          </Pressable>
        </View>
      }
    >
      <ScreenHeader title={t("staplesTitle")} subtitle={t("staplesSubtitle")} showBack />
      {isAdding ? null : <FormMessage message={error} />}

      {staples.length > 0 ? (
        <View className="mb-4 overflow-hidden rounded-3xl border border-cove-line">
          <FrostedFill />
          <View className="flex-row items-center gap-2 px-4 py-2">
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={t("searchPinnedPlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              textAlign={isRTL ? "right" : "left"}
              textAlignVertical="center"
              allowFontScaling={false}
              style={searchInputStyle}
              className="h-11 min-w-0 flex-1 text-cove-ink"
              accessibilityLabel={t("searchPinned")}
            />
            {query.trim() ? (
              <Pressable
                onPress={() => setQuery("")}
                accessibilityRole="button"
                accessibilityLabel={t("cancel")}
                className="h-9 w-9 items-center justify-center rounded-full active:opacity-80"
                style={{ backgroundColor: scheme === "dark" ? colors.paper : colors.mist }}
              >
                <Ionicons name="close" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {staples.length === 0 ? (
        <EmptyState title={t("staplesEmpty")} message={t("staplesEmptyBody")} />
      ) : visibleStaples.length === 0 ? (
        <View className="mb-8">
          <EmptyState title={t("searchPinnedEmpty")} message={t("searchPinnedEmptyBody")} />
        </View>
      ) : (
        <View className="mb-6 gap-3">
          {visibleStaples.map((staple) => {
            const quantityLabel = staple.unit
              ? `${staple.quantity} ${staple.unit}`
              : `x${staple.quantity}`;
            const due = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
              month: "short",
              day: "numeric",
            }).format(new Date(staple.nextDueAt));
            const isAddingThis = addingId === staple.id;
            const isRemovingThis = removingId === staple.id;
            const busy = isAddingThis || isRemovingThis;

            return (
              <View
                key={staple.id}
                className="rounded-3xl bg-cove-paper px-4 py-4"
                style={{
                  shadowColor: scheme === "dark" ? "#000000" : colors.ink,
                  shadowOpacity: scheme === "dark" ? 0.28 : 0.08,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 2,
                }}
              >
                <View className="flex-row items-start gap-3">
                  <View
                    className="mt-0.5 h-10 w-10 items-center justify-center rounded-2xl"
                    style={{
                      backgroundColor:
                        scheme === "dark" ? withAlpha(colors.accent, 0.22) : colors.mist,
                    }}
                  >
                    <MaterialCommunityIcons name="pin" size={18} color={colors.accent} />
                  </View>
                  <View className="min-w-0 flex-1">
                    <AppText
                      numberOfLines={2}
                      className="text-base font-semibold text-cove-ink"
                    >
                      {staple.name}
                    </AppText>
                    <AppText className="mt-1 text-sm text-cove-muted">
                      {quantityLabel} · {categoryName(staple.category)} ·{" "}
                      {t(intervalKeys[staple.intervalDays])}
                    </AppText>
                    <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
                      <MetaChip label={t("nextDue", { date: due })} />
                      {listCounts[staple.id] ? (
                        <MetaChip
                          label={t("pinnedOnList", { count: listCounts[staple.id] })}
                          accent
                        />
                      ) : null}
                    </View>
                  </View>
                </View>

                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    disabled={busy}
                    onPress={() => void onAddToList(staple)}
                    accessibilityRole="button"
                    accessibilityLabel={t("addPinnedToList")}
                    className={`h-11 flex-row items-center justify-center gap-1.5 rounded-2xl px-4 ${
                      busy ? "opacity-45" : "active:opacity-80"
                    }`}
                    style={{
                      backgroundColor: withAlpha(colors.accent, scheme === "dark" ? 0.18 : 0.12),
                      borderWidth: 1,
                      borderColor: withAlpha(
                        scheme === "dark" ? colors.muted : colors.accent,
                        scheme === "dark" ? 0.4 : 0.28,
                      ),
                    }}
                  >
                    {isAddingThis ? (
                      <ActivityIndicator color={colors.accent} size="small" />
                    ) : (
                      <>
                        <Ionicons name="add" size={16} color={colors.accent} />
                        <AppText
                          numberOfLines={1}
                          className="text-sm font-semibold text-cove-accent"
                        >
                          {t("addPinnedToList")}
                        </AppText>
                      </>
                    )}
                  </Pressable>
                  <Pressable
                    disabled={busy}
                    onPress={() => void onRemove(staple.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t("removeStaple")}
                    className={`h-11 flex-row items-center justify-center gap-1.5 rounded-2xl px-4 ${
                      busy ? "opacity-45" : "active:opacity-80"
                    }`}
                    style={{
                      backgroundColor:
                        scheme === "dark" ? "rgba(248, 113, 113, 0.18)" : "rgba(248, 113, 113, 0.12)",
                      borderWidth: 1,
                      borderColor: "rgba(248, 113, 113, 0.45)",
                    }}
                  >
                    {isRemovingThis ? (
                      <ActivityIndicator color={danger} size="small" />
                    ) : (
                      <>
                        <Ionicons name="trash-outline" size={16} color={danger} />
                        <AppText className="text-sm font-semibold" style={{ color: danger }}>
                          {t("removeStaple")}
                        </AppText>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View className="h-24" />

      <Modal
        visible={isAdding}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (!isSaving) closeForm();
        }}
      >
        <View className="flex-1 items-center justify-center px-5">
          <BlurBackdrop onPress={closeForm} disabled={isSaving} />
          <View
            className="w-full max-w-md overflow-hidden rounded-[28px] px-7 pb-5 pt-8"
            style={floatedCardStyle(scheme, colors)}
          >
            <GlassFill soft />
            <View className="-mx-7 mb-6 border-b border-cove-line px-7 pb-5">
              <AppText className="text-lg font-semibold text-cove-ink">{t("addStaple")}</AppText>
            </View>
            <View className="gap-4">
              <View className="flex-row items-stretch gap-3">
                <View className="min-w-0 flex-1">
                  <AppTextField
                    compact
                    glass
                    label={t("itemNameLabel")}
                    value={name}
                    onChangeText={setName}
                    placeholder={t("itemNamePlaceholder")}
                    userText
                  />
                </View>
                <View className="w-20">
                  <AppTextField
                    compact
                    glass
                    label={t("quantity")}
                    value={quantity}
                    onChangeText={(value) => {
                      setQuantity(value);
                      setQuantityError(undefined);
                    }}
                    placeholder="1"
                    keyboardType="decimal-pad"
                    error={quantityError}
                  />
                </View>
              </View>
              <CategoryField glass value={category} onChange={setCategory} />
              <View className="gap-1.5">
                <AppText className="text-xs font-medium text-cove-muted">
                  {t("stapleInterval")}
                </AppText>
                <View className="flex-row flex-wrap gap-2">
                  {STAPLE_INTERVALS.map((days) => {
                    const selected = intervalDays === days;
                    return (
                      <Pressable
                        key={days}
                        onPress={() => setIntervalDays(days)}
                        accessibilityRole="button"
                        className="rounded-full px-3 py-1.5 active:opacity-80"
                        style={{ backgroundColor: selected ? colors.accent : colors.mist }}
                      >
                        <AppText
                          className="text-xs font-medium"
                          style={{ color: selected ? colors.onAccent : colors.ink }}
                        >
                          {t(intervalKeys[days])}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <UrgentToggle compact value={urgent} onValueChange={setUrgent} />
              <Pressable
                onPress={() => setAddNow((value) => !value)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: addNow }}
                className="flex-row items-center gap-3"
              >
                <View
                  className={`h-6 w-6 items-center justify-center rounded-md ${
                    addNow ? "bg-cove-accent" : "bg-cove-line"
                  }`}
                >
                  {addNow ? (
                    <AppText className="text-xs font-semibold" style={{ color: colors.onAccent }}>
                      ✓
                    </AppText>
                  ) : null}
                </View>
                <AppText className="text-base text-cove-ink">{t("addToListNow")}</AppText>
              </Pressable>
              <FormMessage message={error} />
            </View>
            <View className="mt-8 gap-3">
              <AppButton
                compact
                label={t("addStaple")}
                disabled={!name.trim()}
                loading={isSaving}
                onPress={() => void onSave()}
              />
              <AppButton
                compact
                label={t("cancel")}
                variant="ghost"
                disabled={isSaving}
                onPress={closeForm}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function MetaChip({ label, accent = false }: { label: string; accent?: boolean }) {
  const { colors, scheme } = useTheme();

  return (
    <View
      className="rounded-full px-2.5 py-1"
      style={{
        backgroundColor: accent
          ? withAlpha(colors.accent, scheme === "dark" ? 0.22 : 0.14)
          : scheme === "dark"
            ? colors.mist
            : colors.soft,
      }}
    >
      <AppText
        className="text-xs font-medium"
        style={{ color: accent ? colors.accent : colors.ink }}
      >
        {label}
      </AppText>
    </View>
  );
}
