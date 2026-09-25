import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Pressable, View } from "react-native";
import { CategoryFilter } from "@/components/purchases/CategoryFilter";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { AppText } from "@/components/ui/AppText";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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
    updateItem,
  } = usePurchases();
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const [category, setCategory] = useState<PurchaseCategory | "all">("all");
  const [isChoosingCategory, setIsChoosingCategory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<"pin" | "bought" | "delete" | null>(null);
  const isApplyingAction = busyAction !== null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [floatMessage, setFloatMessage] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);

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
      setFloatMessage(
        selected.length === 1 ? t("alreadyPinnedOne") : t("alreadyPinned"),
      );
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

  async function changeQuantity(id: string, quantity: number) {
    const item = needed.find((purchase) => purchase.id === id);
    if (!item || quantity < 1) return;
    setAdjustingId(id);
    setActionError(null);
    const result = await updateItem(id, {
      name: item.name,
      quantity,
      category: item.category,
      urgent: item.urgent,
    });
    setAdjustingId(null);
    if (result.error) setActionError(result.error);
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

  useEffect(() => {
    if (!floatMessage) return;
    const timer = setTimeout(() => setFloatMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [floatMessage]);

  if (isLoading && needed.length === 0 && !error) {
    return <LoadingScreen />;
  }

  const listEmpty = needed.length === 0;

  function listActions() {
    if (isSelecting) return null;

    return (
      <View className="mb-5 flex-row gap-2">
        <ListAction
          label={t("startTrip")}
          disabled={listEmpty}
          onPress={() => router.push("/trip")}
          icon={
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-cove-accent">
              <Ionicons name="storefront" size={20} color={colors.white} />
            </View>
          }
        />
        <ListAction
          label={t("shareList")}
          disabled={listEmpty}
          onPress={() => void shareList()}
          icon={
            <View className="h-11 w-11 items-center justify-center rounded-2xl bg-cove-mist">
              <Ionicons name="share-social" size={20} color={colors.accent} />
            </View>
          }
        />
        <ListAction
          label={t("staplesTitle")}
          onPress={() => router.push("/staples")}
          icon={
            <View
              className="h-11 w-11 items-center justify-center rounded-2xl bg-cove-mist"
              style={{ transform: [{ rotate: isRTL ? "28deg" : "-28deg" }] }}
            >
              <MaterialCommunityIcons name="pin" size={20} color={colors.accent} />
            </View>
          }
        />
        <CategoryFilter
          value={category}
          open={isChoosingCategory}
          onOpen={() => setIsChoosingCategory(true)}
          onClose={() => setIsChoosingCategory(false)}
          onChange={(next) => {
            setCategory(next);
            setSelectedIds(new Set());
            setIsConfirmingDelete(false);
          }}
        />
      </View>
    );
  }

  return (
    <Screen
      tabBarInset
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
      floating={floatMessage ? <FloatMessage message={floatMessage} /> : null}
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
              quantityBusy={adjustingId === purchase.id}
              onChangeQuantity={
                isSelecting
                  ? undefined
                  : (quantity) => void changeQuantity(purchase.id, quantity)
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

function ListAction({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className={`min-h-[92px] flex-1 items-center justify-center gap-2 rounded-3xl bg-cove-paper px-1 py-3 ${
        disabled ? "opacity-45" : "active:opacity-80"
      }`}
    >
      {icon}
      <AppText
        numberOfLines={2}
        className="text-center text-xs font-semibold leading-4 text-cove-ink"
      >
        {label}
      </AppText>
    </Pressable>
  );
}
