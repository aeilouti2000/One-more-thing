import { Ionicons } from "@expo/vector-icons";
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
  const { t, locale } = useI18n();
  const [category, setCategory] = useState<PurchaseCategory | "all">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isApplyingAction, setIsApplyingAction] = useState(false);
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

  async function markSelectionBought() {
    setIsApplyingAction(true);
    setActionError(null);
    const result = await markManyBought([...selectedIds]);
    setIsApplyingAction(false);

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
    setIsApplyingAction(true);
    setActionError(null);
    const result = await deleteMany([...selectedIds]);
    setIsApplyingAction(false);

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
        <View className="mb-5 flex-row gap-3 rounded-3xl bg-cove-paper p-3">
          <Pressable
            disabled={isApplyingAction}
            onPress={() => void markSelectionBought()}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cove-accent px-3 py-3 active:opacity-80"
          >
            {isApplyingAction ? (
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
      ) : (
        <View className="mb-5 gap-3">
          <View className="flex-row gap-3">
            <Pressable
              disabled={needed.length === 0}
              onPress={() => router.push("/trip")}
              accessibilityRole="button"
              accessibilityLabel={t("startTrip")}
              className={`flex-1 items-center rounded-2xl bg-cove-accent px-3 py-3 ${
                needed.length === 0 ? "opacity-50" : "active:opacity-80"
              }`}
            >
              <AppText className="text-sm font-semibold text-white">{t("startTrip")}</AppText>
            </Pressable>
            <Pressable
              disabled={needed.length === 0}
              onPress={() => void shareList()}
              accessibilityRole="button"
              accessibilityLabel={t("shareList")}
              className={`flex-1 items-center rounded-2xl border border-cove-line bg-cove-paper px-3 py-3 ${
                needed.length === 0 ? "opacity-50" : "active:opacity-80"
              }`}
            >
              <AppText className="text-sm font-semibold text-cove-ink">{t("shareList")}</AppText>
            </Pressable>
          </View>
          <Pressable
            onPress={() => router.push("/staples")}
            accessibilityRole="button"
            accessibilityLabel={t("manageStaples")}
            className="flex-row items-center gap-3 rounded-2xl border border-cove-line bg-cove-paper px-4 py-3 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-full bg-cove-mist">
              <Ionicons name="pin" size={iconSize.sm} color={colors.accent} />
            </View>
            <View className="min-w-0 flex-1">
              <AppText className="text-base font-semibold text-cove-ink">{t("staplesTitle")}</AppText>
              <AppText className="mt-0.5 text-sm text-cove-muted">{t("staplesSubtitle")}</AppText>
            </View>
            <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.muted} />
          </Pressable>
          {shareNotice ? <FormMessage message={shareNotice} tone="success" /> : null}
        </View>
      )}

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
