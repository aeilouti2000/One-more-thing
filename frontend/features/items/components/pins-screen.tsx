import { useCallback, useEffect, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Modal, Pressable, TextInput, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { RequireSession } from "@/features/auth/components/require-session";
import { CategoryField } from "@/features/items/components/category-field";
import { UrgentToggle } from "@/features/items/components/urgent-toggle";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { BlurBackdrop, FrostedFill, GlassFill } from "@/components/ui/BlurBackdrop";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getCategoryLabel } from "@/constants/categories";
import { scaleFontSize, singleLineInput } from "@/constants/font";
import { floatedCardStyle, withAlpha } from "@/constants/theme";
import { useCategories } from "@/features/items/providers/categories-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { addItem, fetchHomeItems, updateItemDetails } from "@/features/items/api/items";
import { resolvePreferredListId } from "@/features/items/utils/list-storage";
import { emitListChanged } from "@/features/items/utils/list-sync";
import { fetchLists, listLabel } from "@/features/items/api/lists";
import { parseQuantity } from "@/lib/validation";
import { pinnedNotice } from "@/features/items/utils/pin-notice";
import {
  createPin,
  deletePin,
  fetchPins,
  PIN_INTERVALS,
  type Pin,
  type PinInterval,
} from "@/features/items/api/pins";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useFontScale } from "@/providers/FontScaleProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { TranslationKey } from "@/constants/i18n";
import type { PurchaseCategory } from "@/features/items/types/purchase";

const intervalKeys: Record<PinInterval, TranslationKey> = {
  1: "intervalDay",
  7: "intervalWeek",
  14: "intervalTwoWeeks",
  30: "intervalMonth",
};

const danger = "#F87171";

export default function PinsScreen() {
  return (
    <RequireSession requireHome>
      <PinsBody />
    </RequireSession>
  );
}

function PinsBody() {
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

  const [pins, setPins] = useState<Pin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [category, setCategory] = useState<PurchaseCategory>("supermarket");
  const [urgent, setUrgent] = useState(false);
  const [intervalDays, setIntervalDays] = useState<PinInterval>(7);
  const [addNow, setAddNow] = useState(true);
  const [quantityError, setQuantityError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [listPresence, setListPresence] = useState<
    Record<string, { count: number; listName: string }>
  >({});
  const [query, setQuery] = useState("");
  const [pinPendingDelete, setPinPendingDelete] = useState<Pin | null>(null);
  const [floatMessage, setFloatMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!household) {
      setPins([]);
      setIsLoading(false);
      return;
    }
    const result = await fetchPins(household.id);
    setPins(result.pins);
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
    let listId: string | undefined;
    if (addNow) {
      const listsResult = await fetchLists(household.id);
      if (listsResult.error) {
        setIsSaving(false);
        setError(listsResult.error);
        return;
      }
      listId = resolvePreferredListId(listsResult.lists, household.id) ?? undefined;
    }
    const result = await createPin(household.id, {
      name: name.trim(),
      quantity: parsed,
      category,
      urgent,
      intervalDays,
      addNow,
      listId,
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
    setFloatMessage(pinnedNotice(t, intervalDays));
    await load();
  }

  useEffect(() => {
    if (!floatMessage) return;
    const timer = setTimeout(() => setFloatMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [floatMessage]);

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

  async function onAddToList(pin: Pin) {
    if (!household || !user || addingId) return;
    setAddingId(pin.id);
    setError(null);
    const [listed, listsResult] = await Promise.all([
      fetchHomeItems(household.id),
      fetchLists(household.id),
    ]);
    if (listed.error || listsResult.error) {
      setAddingId(null);
      setError(listed.error ?? listsResult.error);
      return;
    }

    const listId = resolvePreferredListId(listsResult.lists, household.id) ?? undefined;
    const targetList = listId
      ? listsResult.lists.find((list) => list.id === listId) ?? null
      : null;
    const match = listed.items.find(
      (item) =>
        item.status === "needed" &&
        (!listId || item.listId === listId) &&
        item.name.trim().toLowerCase() === pin.name.trim().toLowerCase(),
    );
    const nextQuantity = match ? match.quantity + pin.quantity : pin.quantity;
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
          name: pin.name,
          quantity: pin.quantity,
          category: pin.category,
          unit: pin.unit,
          urgent: pin.urgent,
          listId,
        });

    setAddingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }

    const copies = Math.max(1, Math.round(nextQuantity / pin.quantity));
    const presenceName = listLabel(targetList?.name ?? t("defaultList"), t("defaultList"));
    setListPresence((current) => ({
      ...current,
      [pin.id]: { count: copies, listName: presenceName },
    }));
    emitListChanged();
  }

  async function onRemove(id: string) {
    setRemovingId(id);
    setError(null);
    const result = await deletePin(id);
    setRemovingId(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPinPendingDelete(null);
    await load();
  }

  if (isLoading && pins.length === 0 && !error) {
    return <LoadingScreen />;
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visiblePins = normalizedQuery
    ? pins.filter((pin) => pin.name.toLowerCase().includes(normalizedQuery))
    : pins;

  return (
    <Screen
      floating={floatMessage ? <FloatMessage message={floatMessage} tone="success" /> : null}
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
            accessibilityLabel={t("addPin")}
            className="flex-row items-center gap-3 px-4 py-3.5 active:opacity-80"
          >
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-cove-accent">
              <MaterialCommunityIcons name="pin" size={20} color={colors.onAccent} />
            </View>
            <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
              {t("addPin")}
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
      <ScreenHeader title={t("pinsTitle")} subtitle={t("pinsSubtitle")} showBack />
      {isAdding ? null : <FormMessage message={error} />}

      {pins.length > 0 ? (
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

      {pins.length === 0 ? (
        <EmptyState title={t("pinsEmpty")} message={t("pinsEmptyBody")} />
      ) : visiblePins.length === 0 ? (
        <View className="mb-8">
          <EmptyState title={t("searchPinnedEmpty")} message={t("searchPinnedEmptyBody")} />
        </View>
      ) : (
        <View className="mb-6 gap-3">
          {visiblePins.map((pin) => {
            const quantityLabel = pin.unit
              ? `${pin.quantity} ${pin.unit}`
              : `x${pin.quantity}`;
            const due = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
              month: "short",
              day: "numeric",
            }).format(new Date(pin.nextDueAt));
            const isAddingThis = addingId === pin.id;
            const isRemovingThis = removingId === pin.id;
            const busy = isAddingThis || isRemovingThis;

            return (
              <View
                key={pin.id}
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
                      {pin.name}
                    </AppText>
                    <AppText className="mt-1 text-sm text-cove-muted">
                      {quantityLabel} · {categoryName(pin.category)} ·{" "}
                      {t(intervalKeys[pin.intervalDays])}
                    </AppText>
                    <View className="mt-2.5 flex-row flex-wrap items-center gap-2">
                      <MetaChip label={t("nextDue", { date: due })} />
                      {listPresence[pin.id] ? (
                        <MetaChip
                          label={t("pinnedOnList", {
                            name: listPresence[pin.id].listName,
                            count: listPresence[pin.id].count,
                          })}
                          accent
                        />
                      ) : null}
                    </View>
                  </View>
                </View>

                <View className="mt-4 flex-row gap-2">
                  <Pressable
                    disabled={busy}
                    onPress={() => void onAddToList(pin)}
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
                    onPress={() => {
                      setError(null);
                      setPinPendingDelete(pin);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={t("removePin")}
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
                          {t("removePin")}
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
              <AppText className="text-lg font-semibold text-cove-ink">{t("addPin")}</AppText>
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
                  {t("pinInterval")}
                </AppText>
                <View className="flex-row flex-wrap gap-2">
                  {PIN_INTERVALS.map((days) => {
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
                label={t("addPin")}
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

      <ConfirmModal
        visible={pinPendingDelete !== null}
        title={t("removePinTitle", { name: pinPendingDelete?.name ?? "" })}
        message={t("removePinMessage")}
        confirmLabel={t("removePin")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
        error={error}
        loading={removingId !== null}
        onConfirm={() => {
          if (pinPendingDelete) void onRemove(pinPendingDelete.id);
        }}
        onCancel={() => {
          if (removingId) return;
          setPinPendingDelete(null);
          setError(null);
        }}
      />
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
