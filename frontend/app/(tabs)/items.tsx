import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Animated, Dimensions, Easing, Modal, Pressable, ScrollView, TextInput, View } from "react-native";
import { CategoryFilter } from "@/components/purchases/CategoryFilter";
import { AddItemCard } from "@/components/purchases/AddItemCard";
import { ItemDetailCard } from "@/components/purchases/ItemDetailCard";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { ReorderableList } from "@/components/purchases/ReorderableList";
import { AppText } from "@/components/ui/AppText";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { createList, fetchLists, listLabel, type HomeList } from "@/lib/lists";
import { formatNeededShare, shareNeededText } from "@/lib/share-list";
import { createStaple, fetchStaples } from "@/lib/staples";
import { iconSize } from "@/constants/theme";
import { useHousehold } from "@/hooks/useHousehold";
import { usePurchases } from "@/hooks/usePurchases";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase, PurchaseCategory } from "@/types/purchase";

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
    reorderNeeded,
    addItem,
  } = usePurchases();
  const { colors, scheme } = useTheme();
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
  const [floatTone, setFloatTone] = useState<"error" | "success">("error");
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [quickName, setQuickName] = useState("");
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [lists, setLists] = useState<HomeList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [isChoosingList, setIsChoosingList] = useState(false);
  const [listMenuFrame, setListMenuFrame] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const listButtonRef = useRef<View>(null);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [listName, setListName] = useState("");
  const [isSavingList, setIsSavingList] = useState(false);
  const [isAddingDetails, setIsAddingDetails] = useState(false);
  const [openItem, setOpenItem] = useState<Purchase | null>(null);

  const listItems = selectedListId
    ? needed.filter((item) => item.listId === selectedListId)
    : [];
  const headerButton = {
    backgroundColor: scheme === "dark" ? colors.accent : colors.white,
    icon: scheme === "dark" ? colors.white : colors.accent,
  };
  const visibleItems =
    category === "all"
      ? listItems
      : listItems.filter((item) => item.category === category);
  const isSelecting = selectedIds.size > 0;

  async function onRefresh() {
    setIsRefreshing(true);
    await Promise.all([
      refresh(),
      refreshHome(),
      household ? loadLists(household.id) : Promise.resolve(),
    ]);
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
      setFloatTone("error");
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
    setFloatTone("success");
    setFloatMessage(t("pinnedNotice"));
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
    if (listItems.length === 0) return;
    setShareNotice(null);
    setActionError(null);
    const message = formatNeededShare(listItems, {
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

  useEffect(() => {
    if (!household) {
      setLists([]);
      setSelectedListId(null);
      return;
    }
    void loadLists(household.id);
  }, [household?.id]);

  if (isLoading && needed.length === 0 && !error) {
    return <LoadingScreen />;
  }

  async function quickAdd() {
    const name = quickName.trim();
    if (!name || isQuickAdding || !selectedListId) return;
    setIsQuickAdding(true);
    setActionError(null);
    const result = await addItem({
      name,
      quantity: 1,
      category: category === "all" ? "other" : category,
      urgent: false,
      listId: selectedListId ?? undefined,
    });
    setIsQuickAdding(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setQuickName("");
  }

  const listEmpty = listItems.length === 0;

  async function loadLists(homeId: string) {
    const result = await fetchLists(homeId);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setLists(result.lists);
    setSelectedListId((current) =>
      current && result.lists.some((list) => list.id === current)
        ? current
        : (result.lists[0]?.id ?? null),
    );
  }

  async function saveList() {
    if (!household || !listName.trim() || isSavingList) return;
    setIsSavingList(true);
    setActionError(null);
    const result = await createList(household.id, listName);
    setIsSavingList(false);
    if (result.error || !result.list) {
      setActionError(result.error);
      return;
    }
    setLists((current) => [...current, result.list!]);
    setSelectedListId(result.list.id);
    setCategory("all");
    setListName("");
    setIsCreatingList(false);
  }

  const currentList = lists.find((list) => list.id === selectedListId) ?? null;

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

  function openListMenu() {
    const node = listButtonRef.current;
    if (!node) {
      setIsChoosingList(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setListMenuFrame({ x, y, width, height });
      setIsChoosingList(true);
    });
  }

  function listMenuStyle() {
    const screen = Dimensions.get("window");
    const width = Math.min(220, screen.width - 24);
    const top = listMenuFrame.height ? listMenuFrame.y + listMenuFrame.height + 8 : 88;
    const aligned = listMenuFrame.width
      ? listMenuFrame.x + listMenuFrame.width - width
      : screen.width - width - 16;
    const left = Math.max(12, Math.min(aligned, screen.width - width - 12));
    return {
      top,
      left,
      width,
      maxHeight: Math.max(120, screen.height - top - 24),
      zIndex: 1,
    };
  }

  return (
    <Screen
      tabBarInset
      scrollEnabled={!isDragging}
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
      floating={
        floatMessage ? (
          <FloatMessage message={floatMessage} tone={floatTone} />
        ) : null
      }
      onSwipe={(direction) => {
        if (isSelecting || isDragging || lists.length < 2) return;
        const index = lists.findIndex((list) => list.id === selectedListId);
        const step = direction === "next" ? (isRTL ? -1 : 1) : isRTL ? 1 : -1;
        const next = lists[index + step];
        if (!next) return;
        setSelectedListId(next.id);
        setCategory("all");
        setSelectedIds(new Set());
        setIsConfirmingDelete(false);
        void Haptics.selectionAsync();
      }}
    >
      <ScreenHeader
        title={
          isSelecting ? t("selectedCount", { count: selectedIds.size }) : undefined
        }
        subtitle={isSelecting ? t("selectMoreItems") : undefined}
        right={
          isSelecting ? (
            <Pressable
              onPress={() => {
                setSelectedIds(new Set());
                setIsConfirmingDelete(false);
              }}
              accessibilityRole="button"
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: headerButton.backgroundColor }}
            >
              <Ionicons name="close" size={iconSize.md} color={headerButton.icon} />
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-2">
              {currentList ? (
                <View ref={listButtonRef} collapsable={false}>
                  <Pressable
                    onPress={openListMenu}
                    accessibilityRole="button"
                    accessibilityLabel={t("chooseList")}
                    className="h-11 flex-row items-center gap-0.5 rounded-full px-2.5 active:opacity-80"
                    style={{ backgroundColor: headerButton.backgroundColor }}
                  >
                    <Ionicons name="list" size={20} color={headerButton.icon} />
                    <Ionicons name="chevron-down" size={14} color={headerButton.icon} />
                  </Pressable>
                </View>
              ) : null}
              <Pressable
                onPress={() => setIsCreatingList(true)}
                accessibilityRole="button"
                accessibilityLabel={t("newList")}
                className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
                style={{ backgroundColor: headerButton.backgroundColor }}
              >
                <Ionicons name="add" size={iconSize.md} color={headerButton.icon} />
              </Pressable>
            </View>
          )
        }
      >
        {isSelecting ? null : (
          <View className="min-w-0 flex-1">
            <AppText
              numberOfLines={1}
              className="font-semibold text-white"
              style={{ fontSize: 34, lineHeight: 40 }}
            >
              {household?.name ?? t("yourItems")}
            </AppText>
            <AppText
              numberOfLines={1}
              className="mt-1 text-base"
              style={{ color: scheme === "dark" ? colors.muted : "rgba(255,255,255,0.92)" }}
              accessibilityLabel={t("stillToGet", { count: listItems.length })}
            >
              {t("stillToGet", { count: listItems.length })}
              {currentList
                ? ` · ${listLabel(currentList.name, t("defaultList"))}`
                : ""}
            </AppText>
          </View>
        )}
      </ScreenHeader>

      {isSelecting ? (
        <Bobbing>
          <View className="mb-5 flex-row items-stretch gap-2 rounded-3xl bg-cove-paper p-2.5">
            <Pressable
              disabled={isApplyingAction}
              onPress={() => void markSelectionBought()}
              accessibilityRole="button"
              accessibilityLabel={t("markSelectedBought")}
              className="h-16 min-w-0 flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-cove-accent px-3 active:opacity-80"
            >
              {busyAction === "bought" ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color={colors.white} />
                  <AppText className="text-sm font-semibold text-white">
                    {t("markSelectedBought")}
                  </AppText>
                </>
              )}
            </Pressable>
            <Pressable
              disabled={isApplyingAction}
              onPress={() => void pinSelection()}
              accessibilityRole="button"
              accessibilityLabel={t("pinSelected")}
              className="h-16 w-16 items-center justify-center gap-0.5 rounded-2xl bg-cove-mist px-1 active:opacity-80"
            >
              {busyAction === "pin" ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <View style={{ transform: [{ rotate: isRTL ? "24deg" : "-24deg" }] }}>
                    <MaterialCommunityIcons name="pin" size={18} color={colors.accent} />
                  </View>
                  <AppText className="text-[11px] font-semibold" style={{ color: colors.accent }}>
                    {t("pinSelected")}
                  </AppText>
                </>
              )}
            </Pressable>
            <Pressable
              disabled={isApplyingAction}
              onPress={() => setIsConfirmingDelete(true)}
              accessibilityRole="button"
              accessibilityLabel={t("delete")}
              className="h-16 w-16 items-center justify-center gap-0.5 rounded-2xl border border-red-400 px-1 active:opacity-80"
            >
              {busyAction === "delete" ? (
                <ActivityIndicator color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                  <AppText className="text-[11px] font-semibold text-red-600">
                    {t("delete")}
                  </AppText>
                </>
              )}
            </Pressable>
          </View>
        </Bobbing>
      ) : shareNotice ? (
        <View className="mb-5">
          <FormMessage message={shareNotice} tone="success" />
        </View>
      ) : null}

      {listActions()}

      {isSelecting ? null : (
        <View className="mb-3 flex-row items-center gap-2 rounded-3xl bg-cove-paper px-4 py-2">
          <TextInput
            value={quickName}
            onChangeText={setQuickName}
            placeholder={t("quickAddPlaceholder")}
            placeholderTextColor={colors.muted}
            onSubmitEditing={() => void quickAdd()}
            returnKeyType="done"
            editable={!isQuickAdding}
            textAlign={isRTL ? "right" : "left"}
            className="h-11 min-w-0 flex-1 text-base text-cove-ink"
          />
          <Pressable
            onPress={() => setIsAddingDetails(true)}
            accessibilityRole="button"
            accessibilityLabel={t("addItemDetails")}
            className="h-9 w-9 items-center justify-center rounded-full bg-cove-mist active:opacity-80"
          >
            <Ionicons name="create-outline" size={18} color={colors.accent} />
          </Pressable>
          <Pressable
            disabled={!quickName.trim() || isQuickAdding}
            onPress={() => void quickAdd()}
            accessibilityRole="button"
            accessibilityLabel={t("addItem")}
            className={`h-9 w-9 items-center justify-center rounded-full bg-cove-accent ${
              !quickName.trim() || isQuickAdding ? "opacity-45" : "active:opacity-80"
            }`}
          >
            {isQuickAdding ? (
              <ActivityIndicator color={colors.white} size="small" />
            ) : (
              <Ionicons name="add" size={20} color={colors.white} />
            )}
          </Pressable>
        </View>
      )}

      <FormMessage
        message={isConfirmingDelete ? error : actionError ?? error}
      />

      {visibleItems.length === 0 ? (
        <EmptyState
          title={t("nothingToBuy")}
          message={t("nothingToBuyBody")}
        />
      ) : (
        <ReorderableList
          items={visibleItems}
          enabled={!isSelecting}
          onDragChange={setIsDragging}
          onReorder={(ids) => void reorderNeeded(ids)}
          renderRow={(purchase, handle) => (
            <PurchaseRow
              purchase={purchase}
              leading={isSelecting ? null : handle}
              selected={selectedIds.has(purchase.id)}
              onLongPress={() => startSelection(purchase.id)}
              onPress={() =>
                isSelecting ? toggleSelection(purchase.id) : setOpenItem(purchase)
              }
              quantityBusy={adjustingId === purchase.id}
              onChangeQuantity={
                isSelecting
                  ? undefined
                  : (quantity) => void changeQuantity(purchase.id, quantity)
              }
            />
          )}
        />
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

      <AddItemCard
        visible={isAddingDetails}
        listId={selectedListId}
        initialCategory={category === "all" ? "vegetables" : category}
        onClose={() => setIsAddingDetails(false)}
      />
      <ItemDetailCard
        purchase={openItem}
        visible={openItem !== null}
        onClose={() => setOpenItem(null)}
      />

      <Modal
        visible={isCreatingList}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setIsCreatingList(false)}
      >
        <View className="flex-1 items-center justify-center px-6">
          <Pressable
            onPress={() => setIsCreatingList(false)}
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
          />
          <View className="w-full max-w-md gap-4 rounded-3xl bg-cove-paper p-5">
            <AppText className="text-xl font-semibold text-cove-ink">{t("newList")}</AppText>
            <TextInput
              value={listName}
              onChangeText={setListName}
              placeholder={t("listNamePlaceholder")}
              placeholderTextColor={colors.muted}
              textAlign={isRTL ? "right" : "left"}
              className="h-12 rounded-2xl border border-cove-line bg-cove-ice px-4 text-base text-cove-ink"
            />
            <Pressable
              disabled={!listName.trim() || isSavingList}
              onPress={() => void saveList()}
              className={`items-center rounded-2xl bg-cove-accent px-3 py-3 ${
                !listName.trim() || isSavingList ? "opacity-45" : "active:opacity-80"
              }`}
            >
              {isSavingList ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <AppText className="text-sm font-semibold text-white">{t("createList")}</AppText>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isChoosingList}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setIsChoosingList(false)}
      >
        <View className="flex-1">
          <Pressable
            onPress={() => setIsChoosingList(false)}
            className="absolute inset-0"
          />
          <View
            className="absolute overflow-hidden rounded-2xl bg-cove-paper p-1.5"
            style={listMenuStyle()}
          >
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
              {lists.map((list) => {
                const selected = list.id === selectedListId;
                return (
                  <Pressable
                    key={list.id}
                    onPress={() => {
                      setSelectedListId(list.id);
                      setCategory("all");
                      setSelectedIds(new Set());
                      setIsChoosingList(false);
                    }}
                    className="rounded-xl px-3 py-2.5 active:opacity-80"
                    style={{ backgroundColor: selected ? colors.accent : "transparent" }}
                  >
                    <AppText
                      numberOfLines={1}
                      className="text-sm font-medium"
                      style={{ color: selected ? colors.white : colors.ink }}
                    >
                      {listLabel(list.name, t("defaultList"))}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Bobbing({ children }: { children: ReactNode }) {
  const shift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const motion = Animated.loop(
      Animated.sequence([
        Animated.timing(shift, {
          toValue: -5,
          duration: 240,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(shift, {
          toValue: 5,
          duration: 240,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    motion.start();
    return () => motion.stop();
  }, [shift]);

  return (
    <Animated.View style={{ transform: [{ translateY: shift }] }}>
      {children}
    </Animated.View>
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
