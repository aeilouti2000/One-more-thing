import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { ActivityIndicator, Dimensions, Modal, Pressable, ScrollView, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { RequireSession } from "@/features/auth/components/require-session";
import { CategoryField } from "@/features/items/components/category-field";
import { CategoryFilter } from "@/features/items/components/category-filter";
import { UrgentToggle } from "@/features/items/components/urgent-toggle";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getCategoryLabel } from "@/constants/categories";
import { floatedCardStyle, glassFieldStyle, withAlpha } from "@/constants/theme";
import { useCategories } from "@/features/items/providers/categories-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import { resolvePreferredListId } from "@/features/items/utils/list-storage";
import { fetchLists, listLabel } from "@/features/items/api/lists";
import { readCachedPins } from "@/features/offline/profile-cache";
import { pinnedNotice } from "@/features/items/utils/pin-notice";
import {
  createPin,
  deletePin,
  fetchPins,
  PIN_INTERVALS,
  updatePin,
  type Pin,
  type PinInterval,
} from "@/features/items/api/pins";
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
  const { needed, addItem, updateItem } = usePurchases();
  const { household } = useHousehold();
  const { t, locale, isRTL } = useI18n();
  const { categories } = useCategories();
  const { colors, scheme, shadow } = useTheme();
  const dark = scheme === "dark";

  function categoryName(id: string) {
    const match = categories.find((item) => item.id === id);
    if (match && !match.builtin && match.name) return match.name;
    return getCategoryLabel(id, locale);
  }

  const [pins, setPins] = useState<Pin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<PurchaseCategory>("supermarket");
  const [urgent, setUrgent] = useState(false);
  const [intervalDays, setIntervalDays] = useState<PinInterval>(7);
  const [addNow, setAddNow] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPin, setEditingPin] = useState<Pin | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [listPresence, setListPresence] = useState<
    Record<string, { count: number; listName: string }>
  >({});
  const [categoryFilter, setCategoryFilter] = useState<PurchaseCategory | "all">("all");
  const [isChoosingCategory, setIsChoosingCategory] = useState(false);
  const [pinPendingDelete, setPinPendingDelete] = useState<Pin | null>(null);
  const [floatMessage, setFloatMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!household) {
      setPins([]);
      setIsLoading(false);
      return;
    }
    const cached = readCachedPins<Pin>(household.id);
    if (cached) {
      setPins(cached);
      setError(null);
      setIsLoading(false);
    }
    const result = await fetchPins(household.id);
    if (result.error && cached) {
      setIsLoading(false);
      return;
    }
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
    if (!name.trim()) {
      setError(t("errorEnterItemName"));
      return;
    }

    setIsSaving(true);
    setError(null);
    if (editingPin) {
      const result = await updatePin(editingPin.id, {
        name: name.trim(),
        category,
        urgent,
        intervalDays,
      });
      setIsSaving(false);
      if (result.error) {
        setError(result.error);
        return;
      }
      setIsAdding(false);
      setEditingPin(null);
      setFloatMessage(t("pinUpdated"));
      await load();
      return;
    }

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
      quantity: 1,
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
    setEditingPin(null);
    setError(null);
  }

  function openForm() {
    setEditingPin(null);
    setName("");
    setCategory("supermarket");
    setUrgent(false);
    setIntervalDays(7);
    setAddNow(true);
    setError(null);
    setIsAdding(true);
  }

  function openEdit(pin: Pin) {
    setEditingPin(pin);
    setName(pin.name);
    setCategory(pin.category);
    setUrgent(pin.urgent);
    setIntervalDays(pin.intervalDays);
    setAddNow(false);
    setError(null);
    setIsAdding(true);
  }

  async function onAddToList(pin: Pin) {
    if (!household || addingId) return;
    setAddingId(pin.id);
    setError(null);
    const listsResult = await fetchLists(household.id);
    if (listsResult.error) {
      setAddingId(null);
      setError(listsResult.error);
      return;
    }

    const listId = resolvePreferredListId(listsResult.lists, household.id) ?? undefined;
    const targetList = listId
      ? listsResult.lists.find((list) => list.id === listId) ?? null
      : null;
    const match = needed.find(
      (item) =>
        (!listId || item.listId === listId) &&
        item.name.trim().toLowerCase() === pin.name.trim().toLowerCase(),
    );
    const nextQuantity = match ? match.quantity + pin.quantity : pin.quantity;
    const result = match
      ? await updateItem(match.id, {
          name: match.name,
          quantity: nextQuantity,
          category: match.category,
          urgent: match.urgent,
          notes: match.notes ?? undefined,
        })
      : await addItem({
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

  const visiblePins =
    categoryFilter === "all"
      ? pins
      : pins.filter((pin) => pin.category === categoryFilter);

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
        <View className="mb-4">
          <CategoryFilter
            layout="bar"
            manage={false}
            value={categoryFilter}
            open={isChoosingCategory}
            onOpen={() => setIsChoosingCategory(true)}
            onClose={() => setIsChoosingCategory(false)}
            onChange={setCategoryFilter}
          />
        </View>
      ) : null}

      {pins.length === 0 ? (
        <EmptyState title={t("pinsEmpty")} message={t("pinsEmptyBody")} />
      ) : visiblePins.length === 0 ? (
        <View className="mb-8">
          <EmptyState title={t("filterPinnedEmpty")} message={t("filterPinnedEmptyBody")} />
        </View>
      ) : (
        <View className="mb-6 gap-3">
          {visiblePins.map((pin) => {
            const due = new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
              month: "short",
              day: "numeric",
            }).format(new Date(pin.nextDueAt));
            const isAddingThis = addingId === pin.id;
            const isRemovingThis = removingId === pin.id;
            const busy = isAddingThis || isRemovingThis;

            return (
              <Pressable
                key={pin.id}
                onPress={() => openEdit(pin)}
                accessibilityRole="button"
                className="rounded-3xl bg-cove-paper px-3.5 py-3 active:opacity-80"
                style={{
                  shadowColor: scheme === "dark" ? "#000000" : colors.ink,
                  shadowOpacity: scheme === "dark" ? 0.28 : 0.08,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 2,
                }}
              >
                <View className="flex-row items-center gap-3">
                  <MaterialCommunityIcons name="pin" size={18} color={colors.accent} />
                  <View className="min-w-0 flex-1 gap-1.5">
                    <AppText numberOfLines={1} className="text-base font-semibold text-cove-ink">
                      {pin.name}
                    </AppText>
                    <View className="flex-row flex-wrap items-center gap-1.5">
                      <MetaChip label={categoryName(pin.category)} />
                      <MetaChip label={t(intervalKeys[pin.intervalDays])} />
                      <MetaChip label={due} />
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
                  <View className="flex-row items-center gap-1">
                    <Pressable
                      disabled={busy}
                      onPress={() => void onAddToList(pin)}
                      accessibilityRole="button"
                      accessibilityLabel={t("addPinnedToList")}
                      className={`h-9 w-9 items-center justify-center rounded-full ${
                        busy ? "opacity-45" : "active:opacity-80"
                      }`}
                      style={{ backgroundColor: colors.accent }}
                    >
                      {isAddingThis ? (
                        <ActivityIndicator color={colors.onAccent} size="small" />
                      ) : (
                        <Ionicons name="add" size={18} color={colors.onAccent} />
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
                      className={`h-9 w-9 items-center justify-center rounded-full ${
                        busy ? "opacity-45" : "active:opacity-80"
                      }`}
                    >
                      {isRemovingThis ? (
                        <ActivityIndicator color={danger} size="small" />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color={colors.muted} />
                      )}
                    </Pressable>
                  </View>
                </View>
              </Pressable>
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
            <GlassFill soft neutral />
            <AppText className="mb-6 text-lg font-semibold text-cove-ink">
              {editingPin ? t("editPin") : t("addPin")}
            </AppText>
            <View className="gap-4">
              <AppTextField
                compact
                glass
                label={t("itemNameLabel")}
                value={name}
                onChangeText={setName}
                placeholder={t("itemNamePlaceholder")}
                userText
              />
              <CategoryField glass value={category} onChange={setCategory} />
              <IntervalField value={intervalDays} onChange={setIntervalDays} />
              <UrgentToggle compact value={urgent} onValueChange={setUrgent} />
              {editingPin ? null : (
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
              )}
              <FormMessage message={error} />
            </View>
            <View className="mt-8 gap-3">
              <AppButton
                compact
                label={editingPin ? t("saveChanges") : t("addPin")}
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

function IntervalField({
  value,
  onChange,
}: {
  value: PinInterval;
  onChange: (days: PinInterval) => void;
}) {
  const { t } = useI18n();
  const { colors, scheme, shadow } = useTheme();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(
    null,
  );
  const fieldRef = useRef<View>(null);
  const frame = intervalMenuFrame(anchor);

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
        <AppText className="text-xs font-medium text-cove-muted">{t("pinInterval")}</AppText>
        <View ref={fieldRef} collapsable={false}>
          <Pressable
            onPress={openMenu}
            accessibilityRole="button"
            className="h-10 flex-row items-center justify-between rounded-2xl border px-3 active:opacity-80"
            style={glassFieldStyle(scheme, colors)}
          >
            <AppText className="text-sm font-medium text-cove-ink">
              {t(intervalKeys[value])}
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
              className="overflow-hidden rounded-3xl"
              style={floatedCardStyle(scheme, colors)}
            >
              <GlassFill soft neutral />
              <ScrollView
                bounces={false}
                style={{ flexGrow: 0 }}
                contentContainerStyle={{ gap: 4, padding: 8 }}
              >
                {PIN_INTERVALS.map((days) => {
                  const selected = days === value;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => {
                        onChange(days);
                        setOpen(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className="flex-row items-center justify-between rounded-2xl px-3 py-3 active:opacity-80"
                      style={{ backgroundColor: selected ? colors.accent : "transparent" }}
                    >
                      <AppText
                        className="text-sm font-medium"
                        style={{ color: selected ? colors.onAccent : colors.ink }}
                      >
                        {t(intervalKeys[days])}
                      </AppText>
                      {selected ? (
                        <Ionicons name="checkmark" size={16} color={colors.onAccent} />
                      ) : null}
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

function intervalMenuFrame(anchor: { x: number; y: number; width: number; height: number } | null) {
  const screen = Dimensions.get("window");
  const gap = 8;
  const estimated = PIN_INTERVALS.length * 48 + 16;
  if (!anchor) {
    const width = screen.width - 32;
    return { top: 96, left: 16, width };
  }

  const width = Math.min(Math.max(anchor.width, 180), screen.width - 32);
  const left = Math.max(16, Math.min(anchor.x, screen.width - width - 16));
  const spaceBelow = screen.height - (anchor.y + anchor.height + gap) - 16;
  const openUp = spaceBelow < estimated;
  const top = openUp
    ? Math.max(16, anchor.y - gap - estimated)
    : anchor.y + anchor.height + gap;

  return { top, left, width };
}

function MetaChip({ label, accent = false }: { label: string; accent?: boolean }) {
  const { colors, scheme } = useTheme();

  return (
    <View
      className="rounded-full px-2 py-0.5"
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
        style={{ color: accent ? colors.accent : colors.muted }}
      >
        {label}
      </AppText>
    </View>
  );
}
