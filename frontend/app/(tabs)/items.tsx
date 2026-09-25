import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, View } from "react-native";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { AppText } from "@/components/ui/AppText";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PURCHASE_CATEGORIES } from "@/constants/categories";
import { formatNeededShare, shareNeededText } from "@/lib/share-list";
import { createStaple, fetchStaples } from "@/lib/staples";
import { iconSize } from "@/constants/theme";
import { useHousehold } from "@/hooks/useHousehold";
import { usePurchases } from "@/hooks/usePurchases";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { PurchaseCategory } from "@/types/purchase";

export default function ItemsScreen() {
  const { household, refresh: refreshHome } = useHousehold();
  const {
    needed,
    isLoading,
    error,
    refresh,
    markManyBought,
    deleteMany,
  } = usePurchases();
  const { colors } = useTheme();
  const { t, locale, isRTL } = useI18n();
  const [category, setCategory] = useState<PurchaseCategory | "all">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<"pin" | "bought" | "delete" | null>(null);
  const isApplyingAction = busyAction !== null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const visibleItems =
    category === "all"
      ? needed
      : needed.filter((item) => item.category === category);
  const isSelecting = selectedIds.size > 0;

  async function onRefresh() {
    setIsRefreshing(true);
    await Promise.all([refresh(), refreshHome()]);
    setIsRefreshing(false);
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        setIsConfirmingDelete(false);
      }
      return next;
    });
    setActionError(null);
  }

  function startSelection(id: string) {
    void Haptics.selectionAsync();
    toggleSelection(id);
  }

  async function pinSelection() {
    if (!household) return;
    setBusyAction("pin");
    setActionError(null);
    setShareNotice(null);

    const selected = needed.filter((item) => selectedIds.has(item.id));
    const existing = await fetchStaples(household.id);
    if (existing.error) {
      setBusyAction(null);
      setActionError(existing.error);
      return;
    }

    const pinnedNames = new Set(
      existing.staples.map((staple) => staple.name.trim().toLowerCase()),
    );
    const toPin = selected.filter(
      (item) => !pinnedNames.has(item.name.trim().toLowerCase()),
    );
    if (toPin.length === 0) {
      setBusyAction(null);
      setActionError(t("alreadyPinned"));
      return;
    }

    for (const item of toPin) {
      const result = await createStaple(household.id, {
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        urgent: item.urgent,
        intervalDays: 7,
        addNow: false,
      });
      if (result.error) {
        setBusyAction(null);
        setActionError(result.error);
        return;
      }
    }

    setBusyAction(null);
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setShareNotice(t("pinnedNotice"));
  }

  async function markSelectionBought() {
    setBusyAction("bought");
    setActionError(null);
    const result = await markManyBought([...selectedIds]);
    setBusyAction(null);

    if (result.error) {
      setActionError(result.error);
      return;
    }

    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
  }

  async function shareList() {
    if (needed.length === 0) return;
    setShareNotice(null);
    setActionError(null);
    const message = formatNeededShare(needed, {
      title: t("shareListTitle"),
      urgent: t("urgent"),
    });
    try {
      const result = await shareNeededText(message);
      if (result === "copied") setShareNotice(t("sharedCopied"));
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setActionError(t("errorGeneric"));
    }
  }

  async function deleteSelection() {
    setBusyAction("delete");
    setActionError(null);
    const result = await deleteMany([...selectedIds]);
    setBusyAction(null);

    if (result.error) {
      setActionError(result.error);
      return;
    }

    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
  }

  if (isLoading && needed.length === 0 && !error) {
    return <LoadingScreen />;
  }

  const listEmpty = needed.length === 0;

  function listActions() {
    if (isSelecting) return null;

    return (
      <View className="mb-5 flex-row overflow-hidden rounded-2xl bg-cove-paper">
        <Pressable
          disabled={listEmpty}
          onPress={() => router.push("/trip")}
          accessibilityRole="button"
          accessibilityLabel={t("startTrip")}
          className={`min-h-16 flex-1 items-center justify-center gap-1 px-1.5 py-2 ${
            listEmpty ? "opacity-45" : "active:opacity-80"
          }`}
        >
          <View className="h-7 w-7 items-center justify-center rounded-full bg-cove-accent">
            <Ionicons name="storefront" size={16} color={colors.white} />
          </View>
          <AppText
            numberOfLines={2}
            className="text-center text-[11px] font-semibold leading-4 text-cove-ink"
          >
            {t("startTrip")}
          </AppText>
        </Pressable>
        <Pressable
          disabled={listEmpty}
          onPress={() => void shareList()}
          accessibilityRole="button"
          accessibilityLabel={t("shareList")}
          className={`min-h-16 flex-1 items-center justify-center gap-1 px-1.5 py-2 ${
            listEmpty ? "opacity-45" : "active:opacity-80"
          }`}
        >
          <View className="h-7 w-7 items-center justify-center rounded-full bg-cove-mist">
            <Ionicons name="share-social" size={16} color={colors.accent} />
          </View>
          <AppText
            numberOfLines={2}
            className="text-center text-[11px] font-semibold leading-4 text-cove-ink"
          >
            {t("shareList")}
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => router.push("/staples")}
          accessibilityRole="button"
          accessibilityLabel={t("manageStaples")}
          className="min-h-16 flex-1 items-center justify-center gap-1 px-1.5 py-2 active:opacity-80"
        >
          <View
            className="h-7 w-7 items-center justify-center rounded-full bg-cove-mist"
            style={{ transform: [{ rotate: isRTL ? "28deg" : "-28deg" }] }}
          >
            <MaterialCommunityIcons name="pin" size={16} color={colors.accent} />
          </View>
          <AppText
            numberOfLines={2}
            className="text-center text-[11px] font-semibold leading-4 text-cove-ink"
          >
            {t("staplesTitle")}
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <Screen
      tabBarInset
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
    >
      <ScreenHeader
        title={
          isSelecting
            ? t("selectedCount", { count: selectedIds.size })
            : household?.name ?? t("yourItems")
        }
        subtitle={
          isSelecting
            ? t("selectMoreItems")
            : t("stillToGet", { count: needed.length })
        }
        right={
          <Pressable
            onPress={() =>
              isSelecting
                ? (setSelectedIds(new Set()), setIsConfirmingDelete(false))
                : router.push("/item/new")
            }
            className="h-11 w-11 items-center justify-center rounded-full bg-white"
          >
            <Ionicons
              name={isSelecting ? "close" : "add"}
              size={iconSize.md}
              color={colors.accent}
            />
          </Pressable>
        }
      />

      {isSelecting ? (
        <View className="mb-5 gap-3 rounded-3xl bg-cove-paper p-3">
          <Pressable
            disabled={isApplyingAction}
            onPress={() => void pinSelection()}
            accessibilityRole="button"
            accessibilityLabel={t("pinSelected")}
            className="flex-row items-center justify-center gap-2 rounded-2xl bg-cove-mist px-3 py-3 active:opacity-80"
          >
            {busyAction === "pin" ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <View style={{ transform: [{ rotate: isRTL ? "28deg" : "-28deg" }] }}>
                  <MaterialCommunityIcons name="pin" size={iconSize.sm} color={colors.accent} />
                </View>
                <AppText className="text-sm font-semibold text-cove-ink">
                  {t("pinSelected")}
                </AppText>
              </>
            )}
          </Pressable>
          <View className="flex-row gap-3">
          <Pressable
            disabled={isApplyingAction}
            onPress={() => void markSelectionBought()}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cove-accent px-3 py-3 active:opacity-80"
          >
            {busyAction === "bought" ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <AppText className="text-sm font-semibold text-white">
                {t("markSelectedBought")}
              </AppText>
            )}
          </Pressable>
          <Pressable
            disabled={isApplyingAction}
            onPress={() => setIsConfirmingDelete(true)}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl border border-red-400 px-3 py-3 active:opacity-80"
          >
            <Ionicons name="trash-outline" size={iconSize.sm} color="#DC2626" />
            <AppText className="text-sm font-semibold text-red-600">
              {t("delete")}
            </AppText>
          </Pressable>
          </View>
        </View>
      ) : shareNotice ? (
        <View className="mb-5">
          <FormMessage message={shareNotice} tone="success" />
        </View>
      ) : null}

      <View key={locale} className="mb-5 flex-row flex-wrap gap-2">
        <CategoryChip
          label={t("all")}
          selected={category === "all"}
          onPress={() => {
            setCategory("all");
            setSelectedIds(new Set());
            setIsConfirmingDelete(false);
          }}
        />
        {PURCHASE_CATEGORIES.map((item) => (
          <CategoryChip
            key={`${item.id}-${locale}`}
            category={item.id}
            selected={category === item.id}
            onPress={() => {
              setCategory(item.id);
              setSelectedIds(new Set());
              setIsConfirmingDelete(false);
            }}
          />
        ))}
      </View>

      {listActions()}

      <FormMessage
        message={isConfirmingDelete ? error : actionError ?? error}
      />

      {visibleItems.length === 0 ? (
        <EmptyState
          title={t("nothingToBuy")}
          message={t("nothingToBuyBody")}
        />
      ) : (
        <View className="gap-3">
          {visibleItems.map((purchase) => (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              selected={selectedIds.has(purchase.id)}
              onLongPress={() => startSelection(purchase.id)}
              onPress={() =>
                isSelecting
                  ? toggleSelection(purchase.id)
                  : router.push({
                      pathname: "/item/[id]",
                      params: { id: purchase.id },
                    })
              }
            />
          ))}
        </View>
      )}

      <ConfirmModal
        visible={isConfirmingDelete}
        title={t("deleteItemsTitle")}
        message={t("deleteItemsMessage", { count: selectedIds.size })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        error={actionError}
        loading={isApplyingAction}
        onConfirm={() => void deleteSelection()}
        onCancel={() => {
          setIsConfirmingDelete(false);
          setActionError(null);
        }}
      />
    </Screen>
  );
}
