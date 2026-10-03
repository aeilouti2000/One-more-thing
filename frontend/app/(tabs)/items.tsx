import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, BackHandler, Dimensions, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { CategoryFilter } from "@/components/purchases/CategoryFilter";
import { AddItemCard } from "@/components/purchases/AddItemCard";
import { CostEntrySheet } from "@/components/purchases/CostEntrySheet";
import { ItemDetailCard } from "@/components/purchases/ItemDetailCard";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { QuickAddBar } from "@/components/purchases/QuickAddBar";
import { ReorderableList } from "@/components/purchases/ReorderableList";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, FrostedBlur, FrostedFill, GlassFill } from "@/components/ui/BlurBackdrop";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { ListsHeaderIcon } from "@/components/ui/ListsHeaderIcon";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen, SwipeSlideContent } from "@/components/ui/Screen";
import { useTabBarVisibility } from "@/components/ui/TabBarVisibility";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { createList, deleteList, fetchLists, listLabel, renameList, type HomeList } from "@/lib/lists";
import { resolvePreferredListId, writeStoredListId } from "@/lib/list-storage";
import { formatNeededShare, shareNeededText } from "@/lib/share-list";
import { createStaple, fetchStaples } from "@/lib/staples";
import { scaleFontSize, singleLineInput } from "@/constants/font";
import { useFontScale } from "@/providers/FontScaleProvider";
import { iconSize, floatedCardStyle, tabBar, withAlpha } from "@/constants/theme";
import { useHousehold } from "@/hooks/useHousehold";
import { usePurchases } from "@/hooks/usePurchases";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase, PurchaseCategory } from "@/types/purchase";

export default function ItemsScreen() {
  const { household, refresh: refreshHome } = useHousehold();
  const {
    needed,
    purchases,
    isLoading,
    error,
    refresh,
    markManyBought,
    deleteMany,
    moveMany,
    updateItem,
    reorderNeeded,
    addItem,
  } = usePurchases();
  const { colors, scheme } = useTheme();
  const { setHidden: setTabBarHidden } = useTabBarVisibility();
  const { t, isRTL } = useI18n();
  const { scale } = useFontScale();
  const quickInputStyle = {
    ...singleLineInput,
    fontSize: scaleFontSize(Number(singleLineInput.fontSize), scale),
  };
  const [category, setCategory] = useState<PurchaseCategory | "all">("all");
  const [isChoosingCategory, setIsChoosingCategory] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<
    "pin" | "bought" | "delete" | "urgent" | "move" | null
  >(null);
  const isApplyingAction = busyAction !== null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isMovingToList, setIsMovingToList] = useState(false);
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
  const listsLoadSeq = useRef(0);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [listPendingDelete, setListPendingDelete] = useState<HomeList | null>(null);
  const [listName, setListName] = useState("");
  const [listFormError, setListFormError] = useState<string | null>(null);
  const [isSavingList, setIsSavingList] = useState(false);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [isAddingDetails, setIsAddingDetails] = useState(false);
  const [openItem, setOpenItem] = useState<Purchase | null>(null);
  const [bulkCostIds, setBulkCostIds] = useState<string[] | null>(null);

  useEffect(() => {
    if (!openItem) return;
    const next = purchases.find((item) => item.id === openItem.id);
    setOpenItem(next ?? null);
  }, [purchases, openItem?.id]);

  const listItems = selectedListId
    ? needed.filter((item) => item.listId === selectedListId)
    : [];
  const headerButton = {
    backgroundColor: scheme === "dark" ? colors.accent : colors.white,
    icon: scheme === "dark" ? colors.onAccent : colors.accent,
  };
  const visibleItems =
    category === "all"
      ? listItems
      : listItems.filter((item) => item.category === category);
  const isSelecting = selectedIds.size > 0;
  const selectedItems = needed.filter((item) => selectedIds.has(item.id));
  const allSelectedUrgent =
    selectedItems.length > 0 && selectedItems.every((item) => item.urgent);

  function rememberList(homeId: string, listId: string) {
    setSelectedListId(listId);
    writeStoredListId(homeId, listId);
  }

  async function loadLists(homeId: string) {
    const sequence = ++listsLoadSeq.current;
    const result = await fetchLists(homeId);
    if (sequence !== listsLoadSeq.current) return;
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setLists(result.lists);
    setSelectedListId((current) => {
      const next =
        current && result.lists.some((list) => list.id === current)
          ? current
          : resolvePreferredListId(result.lists, homeId);
      if (next) writeStoredListId(homeId, next);
      return next;
    });
  }

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

  function cancelSelection() {
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setIsMovingToList(false);
  }

  const neededIdsKey = needed.map((item) => item.id).join("\0");
  const [prunedNeededKey, setPrunedNeededKey] = useState(neededIdsKey);
  if (neededIdsKey !== prunedNeededKey) {
    setPrunedNeededKey(neededIdsKey);
    if (selectedIds.size > 0) {
      const valid = new Set(needed.map((item) => item.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of selectedIds) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      if (changed) {
        setSelectedIds(next);
        if (next.size === 0) setIsConfirmingDelete(false);
      }
    }
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
    const ids = [...selectedIds];
    if (
      household?.costsEnabled &&
      household.askCostOnBulkBuy !== false &&
      ids.length > 0
    ) {
      setBulkCostIds(ids);
      return;
    }
    await completeBulkBought(ids.map((id) => ({ id, cost: null })));
  }

  async function completeBulkBought(entries: { id: string; cost: number | null }[]) {
    setBusyAction("bought");
    setActionError(null);
    const result = await markManyBought(entries);
    setBusyAction(null);

    if (result.error) {
      setActionError(result.error);
      return;
    }

    setBulkCostIds(null);
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
  }

  const bulkCostItems = useMemo(
    () =>
      (bulkCostIds ?? []).map((id) => {
        const item = needed.find((row) => row.id === id);
        return { id, name: item?.name ?? id };
      }),
    [bulkCostIds, needed],
  );

  async function markSelectionUrgent() {
    setBusyAction("urgent");
    setActionError(null);

    const selected = needed.filter((item) => selectedIds.has(item.id));
    const toMark = selected.filter((item) => !item.urgent);
    const nextUrgent = toMark.length > 0;
    const targets = nextUrgent ? toMark : selected;

    for (const item of targets) {
      const result = await updateItem(item.id, {
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        urgent: nextUrgent,
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

  async function moveSelectionToList(list: HomeList) {
    if (busyAction || selectedIds.size === 0) return;
    setBusyAction("move");
    setActionError(null);
    const result = await moveMany([...selectedIds], list.id);
    setBusyAction(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setIsMovingToList(false);
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setFloatTone("success");
    setFloatMessage(t("movedNotice", { name: listLabel(list.name, t("defaultList")) }));
  }

  useEffect(() => {
    if (!floatMessage) return;
    const timer = setTimeout(() => setFloatMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [floatMessage]);

  const homeId = household?.id;
  useEffect(() => {
    if (!homeId) {
      queueMicrotask(() => {
        setLists([]);
        setSelectedListId(null);
      });
      return;
    }
    // Fetch lists when the active home changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async load updates list state on completion
    void loadLists(homeId);
  }, [homeId]);

  useLayoutEffect(() => {
    setTabBarHidden(isSelecting);
    return () => setTabBarHidden(false);
  }, [isSelecting, setTabBarHidden]);

  useFocusEffect(
    useCallback(() => {
      if (!isSelecting) return;
      const onBackPress = () => {
        setSelectedIds(new Set());
        setIsConfirmingDelete(false);
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [isSelecting]),
  );

  const canSwipeList = useCallback(
    (direction: "next" | "previous") => {
      if (isSelecting || isDragging || lists.length < 2) return false;
      const index = lists.findIndex((list) => list.id === selectedListId);
      if (index < 0) return false;
      const step = direction === "next" ? (isRTL ? -1 : 1) : isRTL ? 1 : -1;
      return Boolean(lists[index + step]);
    },
    [isDragging, isRTL, isSelecting, lists, selectedListId],
  );

  const onSwipeList = useCallback(
    (direction: "next" | "previous") => {
      if (isSelecting || isDragging || lists.length < 2) return;
      const index = lists.findIndex((list) => list.id === selectedListId);
      const step = direction === "next" ? (isRTL ? -1 : 1) : isRTL ? 1 : -1;
      const next = lists[index + step];
      if (!next || !homeId) return;
      setSelectedListId(next.id);
      writeStoredListId(homeId, next.id);
      setCategory("all");
      setSelectedIds(new Set());
      setIsConfirmingDelete(false);
      void Haptics.selectionAsync();
    },
    [homeId, isDragging, isRTL, isSelecting, lists, selectedListId],
  );

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

  function closeListForm() {
    if (isSavingList) return;
    setIsCreatingList(false);
    setEditingListId(null);
    setListName("");
    setListFormError(null);
  }

  function openCreateList() {
    setEditingListId(null);
    setListName("");
    setListFormError(null);
    setIsChoosingList(false);
    setIsCreatingList(true);
  }

  function openRenameList(list: HomeList) {
    setEditingListId(list.id);
    setListName(listLabel(list.name, t("defaultList")));
    setListFormError(null);
    setIsChoosingList(false);
    setIsCreatingList(true);
  }

  function askDeleteList(list: HomeList) {
    if (lists.length < 2) {
      setFloatTone("error");
      setFloatMessage(t("errorKeepOneList"));
      return;
    }
    setActionError(null);
    setIsChoosingList(false);
    setListPendingDelete(list);
  }

  async function saveList() {
    if (!household || !listName.trim() || isSavingList) return;
    setIsSavingList(true);
    setListFormError(null);
    const result = editingListId
      ? await renameList(household.id, editingListId, listName)
      : await createList(household.id, listName);
    setIsSavingList(false);
    if (result.error || !result.list) {
      setListFormError(result.error);
      return;
    }
    if (editingListId) {
      setLists((current) =>
        current.map((list) => (list.id === result.list!.id ? result.list! : list)),
      );
    } else {
      setLists((current) => [...current, result.list!]);
      rememberList(household.id, result.list.id);
      setCategory("all");
    }
    setListName("");
    setEditingListId(null);
    setIsCreatingList(false);
  }

  async function confirmDeleteList() {
    if (!household || !listPendingDelete || isDeletingList) return;
    setIsDeletingList(true);
    setActionError(null);
    const result = await deleteList(household.id, listPendingDelete.id);
    setIsDeletingList(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    const removedId = listPendingDelete.id;
    const remaining = lists.filter((list) => list.id !== removedId);
    setLists(remaining);
    setSelectedListId((current) => {
      const next = current === removedId ? (remaining[0]?.id ?? null) : current;
      if (next) writeStoredListId(household.id, next);
      return next;
    });
    setCategory("all");
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setListPendingDelete(null);
    void refresh();
  }

  const currentList = lists.find((list) => list.id === selectedListId) ?? null;

  function listActions() {
    if (isSelecting) return null;

    return (
      <View className="mb-5 flex-row gap-2">
        <ListAction
          label={t("shop")}
          disabled={listEmpty || !selectedListId}
          onPress={() => {
            if (!selectedListId) return;
            router.push({
              pathname: "/trip",
              params: {
                listId: selectedListId,
                listName: currentList?.name ?? "",
              },
            });
          }}
          icon={
            <View className="h-10 w-10 items-center justify-center rounded-2xl bg-cove-accent">
              <MaterialCommunityIcons name="cart-check" size={18} color={colors.onAccent} />
            </View>
          }
        />
        <ListAction
          label={t("share")}
          disabled={listEmpty}
          onPress={() => void shareList()}
          icon={
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{ backgroundColor: scheme === "dark" ? colors.soft : colors.mist }}
            >
              <Ionicons name="share-social" size={18} color={colors.accent} />
            </View>
          }
        />
        <ListAction
          label={t("pin")}
          onPress={() => router.push("/staples")}
          icon={
            <View
              className="h-10 w-10 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: scheme === "dark" ? colors.soft : colors.mist,
                transform: [{ rotate: isRTL ? "28deg" : "-28deg" }],
              }}
            >
              <MaterialCommunityIcons name="pin" size={18} color={colors.accent} />
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
    const width = Math.min(screen.width - 32, 420);
    const top = listMenuFrame.height ? listMenuFrame.y + listMenuFrame.height + 10 : 88;
    const aligned = listMenuFrame.width
      ? listMenuFrame.x + listMenuFrame.width - width
      : screen.width - width - 16;
    const left = Math.max(16, Math.min(aligned, screen.width - width - 16));
    return {
      top,
      left,
      width,
      maxHeight: Math.max(220, screen.height - top - 24),
      zIndex: 1,
    };
  }

  const header = (
    <ScreenHeader
      flush={!isSelecting}
      compact={isSelecting}
      icon={isSelecting ? undefined : <ListsHeaderIcon />}
      title={
        isSelecting ? t("selectedCount", { count: selectedIds.size }) : undefined
      }
      subtitle={isSelecting ? t("selectMoreItems") : undefined}
      right={
        isSelecting ? (
          <Pressable
            onPress={cancelSelection}
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            className="h-11 w-11 items-center justify-center self-center rounded-full"
            style={{ backgroundColor: headerButton.backgroundColor }}
          >
            <Ionicons name="close" size={iconSize.md} color={headerButton.icon} />
          </Pressable>
        ) : (
          <View ref={listButtonRef} collapsable={false}>
            <Pressable
              onPress={openListMenu}
              accessibilityRole="button"
              accessibilityLabel={t("chooseList")}
              className="h-11 w-11 items-center justify-center overflow-hidden rounded-full active:opacity-80"
              style={{ backgroundColor: "transparent" }}
            >
              <FrostedBlur style={StyleSheet.absoluteFill} />
              <View
                pointerEvents="none"
                style={[
                  StyleSheet.absoluteFill,
                  {
                    backgroundColor:
                      scheme === "dark"
                        ? withAlpha(colors.accent, 0.35)
                        : withAlpha(colors.white, 0.45),
                  },
                ]}
              />
              <Ionicons name="list" size={22} color={headerButton.icon} />
            </Pressable>
          </View>
        )
      }
    >
      {isSelecting ? null : (
        <View className="min-w-0 flex-1">
          <AppText
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.65}
            className="text-3xl font-semibold tracking-tight"
            style={{ color: scheme === "dark" ? colors.ink : colors.onAccent }}
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
  );

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
      top={isSelecting ? header : null}
      dock={
        isSelecting ? (
          <SelectionBar
            busyAction={busyAction}
            disabled={isApplyingAction}
            clearUrgent={allSelectedUrgent}
            canMove={lists.filter((list) => list.id !== selectedListId).length > 0}
            onBought={() => void markSelectionBought()}
            onPin={() => void pinSelection()}
            onUrgent={() => void markSelectionUrgent()}
            onMove={() => {
              setActionError(null);
              setIsMovingToList(true);
            }}
            onDelete={() => {
              setActionError(null);
              setIsConfirmingDelete(true);
            }}
          />
        ) : null
      }
      canSwipe={canSwipeList}
      onSwipe={onSwipeList}
    >
      {isSelecting ? null : header}

      {shareNotice && !isSelecting ? (
        <View className="mb-5">
          <FormMessage
            message={shareNotice}
            tone="success"
            onDismiss={() => setShareNotice(null)}
          />
        </View>
      ) : null}

      {listActions()}

      {isSelecting ? null : (
        <QuickAddBar
          value={quickName}
          onChangeText={setQuickName}
          onSubmit={() => void quickAdd()}
          onOpenDetails={() => setIsAddingDetails(true)}
          busy={isQuickAdding}
          inputStyle={quickInputStyle}
        />
      )}

      <FormMessage
        message={isConfirmingDelete ? error : actionError ?? error}
      />

      <SwipeSlideContent>
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
            onItemLongPress={startSelection}
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
      </SwipeSlideContent>

      <ConfirmModal
        visible={isConfirmingDelete}
        title={t("deleteItemsTitle")}
        message={t("deleteItemsMessage", { count: selectedIds.size })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
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
        initialName={quickName}
        onClose={() => setIsAddingDetails(false)}
        onSaved={() => setQuickName("")}
      />
      <ItemDetailCard
        purchase={openItem}
        visible={openItem !== null}
        onClose={() => setOpenItem(null)}
      />

      <CostEntrySheet
        visible={bulkCostIds !== null}
        title={t("enterCosts")}
        currency={household?.currency ?? "JOD"}
        items={bulkCostItems}
        loading={busyAction === "bought"}
        errorMessage={actionError}
        onConfirm={(entries) => void completeBulkBought(entries)}
        onSkip={() =>
          void completeBulkBought((bulkCostIds ?? []).map((id) => ({ id, cost: null })))
        }
        onClose={() => {
          if (busyAction === "bought") return;
          setBulkCostIds(null);
          setActionError(null);
        }}
      />

      <ConfirmModal
        visible={listPendingDelete !== null}
        title={t("deleteListTitle")}
        message={t("deleteListMessage", {
          name: listLabel(listPendingDelete?.name ?? "", t("defaultList")),
        })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
        error={actionError}
        loading={isDeletingList}
        onConfirm={() => void confirmDeleteList()}
        onCancel={() => {
          if (isDeletingList) return;
          setListPendingDelete(null);
          setActionError(null);
        }}
      />

      <Modal
        visible={isMovingToList}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (busyAction === "move") return;
          setIsMovingToList(false);
          setActionError(null);
        }}
      >
        <View className="flex-1 items-center justify-center px-6">
          <BlurBackdrop
            onPress={() => {
              if (busyAction === "move") return;
              setIsMovingToList(false);
              setActionError(null);
            }}
            disabled={busyAction === "move"}
          />
          <View
            className="w-full max-w-md gap-3 overflow-hidden rounded-3xl p-5"
            style={floatedCardStyle(scheme, colors)}
          >
            <GlassFill soft />
            <AppText className="text-xl font-semibold text-cove-ink">{t("moveToList")}</AppText>
            <FormMessage message={actionError} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              style={{ flexGrow: 0, maxHeight: 280 }}
            >
              {lists
                .filter((list) => list.id !== selectedListId)
                .map((list) => (
                  <Pressable
                    key={list.id}
                    disabled={busyAction === "move"}
                    onPress={() => void moveSelectionToList(list)}
                    accessibilityRole="button"
                    accessibilityLabel={listLabel(list.name, t("defaultList"))}
                    className={`mb-1 h-12 flex-row items-center gap-3 rounded-2xl px-3 ${
                      busyAction === "move" ? "opacity-45" : "active:opacity-80"
                    }`}
                    style={{
                      backgroundColor: withAlpha(colors.accent, scheme === "dark" ? 0.18 : 0.1),
                    }}
                  >
                    <Ionicons name="list-outline" size={20} color={colors.accent} />
                    <AppText numberOfLines={1} className="min-w-0 flex-1 text-base text-cove-ink">
                      {listLabel(list.name, t("defaultList"))}
                    </AppText>
                    {busyAction === "move" ? (
                      <ActivityIndicator color={colors.accent} />
                    ) : (
                      <Ionicons
                        name={isRTL ? "chevron-back" : "chevron-forward"}
                        size={18}
                        color={colors.muted}
                      />
                    )}
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isCreatingList}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeListForm}
      >
        <View className="flex-1 items-center justify-center px-6">
          <BlurBackdrop onPress={closeListForm} disabled={isSavingList} />
          <View
            className="w-full max-w-md gap-4 overflow-hidden rounded-3xl p-5"
            style={floatedCardStyle(scheme, colors)}
          >
            <GlassFill soft />
            <AppText className="text-xl font-semibold text-cove-ink">
              {editingListId ? t("editList") : t("newList")}
            </AppText>
            <TextInput
              value={listName}
              onChangeText={setListName}
              placeholder={t("listNamePlaceholder")}
              placeholderTextColor={colors.muted}
              textAlign={isRTL ? "right" : "left"}
              textAlignVertical="center"
              allowFontScaling={false}
              autoFocus
              style={quickInputStyle}
              className="h-12 rounded-2xl border border-cove-line bg-cove-ice px-4 text-cove-ink"
            />
            <FormMessage message={listFormError} />
            <Pressable
              disabled={!listName.trim() || isSavingList}
              onPress={() => void saveList()}
              className={`items-center rounded-2xl bg-cove-accent px-3 py-3 ${
                !listName.trim() || isSavingList ? "opacity-45" : "active:opacity-80"
              }`}
            >
              {isSavingList ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                  {editingListId ? t("saveChanges") : t("createList")}
                </AppText>
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
          <BlurBackdrop onPress={() => setIsChoosingList(false)} />
          <View
            className="absolute overflow-hidden rounded-3xl border border-cove-line p-3"
            style={listMenuStyle()}
          >
            <GlassFill soft />
            <AppText className="mb-2 px-1 text-base font-semibold text-cove-ink">
              {t("yourLists")}
            </AppText>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              bounces={false}
              style={{ flexGrow: 0, maxHeight: Math.max(96, listMenuStyle().maxHeight - 132) }}
            >
              {lists.map((list) => {
                const selected = list.id === selectedListId;
                const label = listLabel(list.name, t("defaultList"));
                return (
                  <View
                    key={list.id}
                    className="mb-1 flex-row items-center rounded-2xl px-2"
                    style={{
                      backgroundColor: selected
                        ? withAlpha(colors.accent, scheme === "dark" ? 0.28 : 0.16)
                        : "transparent",
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        if (household) rememberList(household.id, list.id);
                        setCategory("all");
                        setSelectedIds(new Set());
                        setIsChoosingList(false);
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      className="h-12 min-w-0 flex-1 flex-row items-center gap-3 active:opacity-80"
                    >
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={22}
                        color={selected ? colors.accent : colors.muted}
                      />
                      <AppText
                        numberOfLines={1}
                        className="min-w-0 flex-1 text-base"
                        style={{ color: colors.ink }}
                      >
                        {label}
                      </AppText>
                    </Pressable>
                    <Pressable
                      onPress={() => openRenameList(list)}
                      accessibilityRole="button"
                      accessibilityLabel={t("editListName")}
                      hitSlop={8}
                      className="h-10 w-10 items-center justify-center active:opacity-70"
                    >
                      <Ionicons name="create-outline" size={18} color={colors.accent} />
                    </Pressable>
                    <Pressable
                      onPress={() => askDeleteList(list)}
                      accessibilityRole="button"
                      accessibilityLabel={t("deleteList")}
                      hitSlop={8}
                      className="h-10 w-10 items-center justify-center active:opacity-70"
                    >
                      <Ionicons name="trash-outline" size={18} color="#F87171" />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
            <Pressable
              onPress={openCreateList}
              accessibilityRole="button"
              accessibilityLabel={t("newList")}
              className="mt-2 h-12 flex-row items-center justify-center gap-2 rounded-2xl active:opacity-80"
              style={{
                backgroundColor: scheme === "dark" ? colors.soft : colors.mist,
              }}
            >
              <Ionicons name="add" size={20} color={colors.accent} />
              <AppText className="text-base font-semibold" style={{ color: colors.accent }}>
                {t("newList")}
              </AppText>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function SelectionBar({
  busyAction,
  disabled,
  clearUrgent,
  canMove,
  onBought,
  onPin,
  onUrgent,
  onMove,
  onDelete,
}: {
  busyAction: "pin" | "bought" | "delete" | "urgent" | "move" | null;
  disabled: boolean;
  clearUrgent: boolean;
  canMove: boolean;
  onBought: () => void;
  onPin: () => void;
  onUrgent: () => void;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { colors, scheme, shadow } = useTheme();
  const { t, isRTL } = useI18n();
  const dark = scheme === "dark";
  const danger = "#F87171";
  const actionColor = colors.ink;

  function actionButton(
    label: string,
    busy: boolean,
    onPress: () => void,
    icon: ReactNode,
    color: string,
    locked = false,
  ) {
    const inactive = disabled || locked;
    return (
      <Pressable
        disabled={inactive}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: inactive }}
        style={[selectionStyles.cell, { opacity: inactive ? 0.5 : 1 }]}
        android_ripple={null}
      >
        {busy ? (
          <ActivityIndicator color={color} />
        ) : (
          <>
            <View style={selectionStyles.iconSlot}>{icon}</View>
            <AppText
              numberOfLines={1}
              style={[selectionStyles.label, { color }]}
            >
              {label}
            </AppText>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <View
      style={{
        shadowColor: shadow.color,
        shadowOffset: shadow.offset,
        shadowOpacity: dark ? 0.42 : 0.16,
        shadowRadius: 24,
        elevation: shadow.elevation,
      }}
    >
      <View
        style={[
          selectionStyles.shell,
          {
            borderColor: withAlpha(dark ? colors.muted : colors.accent, 0.34),
            backgroundColor: withAlpha(dark ? colors.deep : colors.mist, dark ? 0.55 : 0.72),
          },
        ]}
      >
        <GlassFill soft screenBlur />
        <View style={selectionStyles.row}>
          {actionButton(
            t("markSelectedBought"),
            busyAction === "bought",
            onBought,
            <MaterialCommunityIcons name="cart-check" size={20} color={actionColor} />,
            actionColor,
          )}
          {actionButton(
            t("pinSelected"),
            busyAction === "pin",
            onPin,
            <View style={{ transform: [{ rotate: isRTL ? "28deg" : "-28deg" }] }}>
              <MaterialCommunityIcons name="pin" size={18} color={actionColor} />
            </View>,
            actionColor,
          )}
          {actionButton(
            t("moveSelected"),
            busyAction === "move",
            onMove,
            <Ionicons name="swap-horizontal" size={18} color={actionColor} />,
            actionColor,
            !canMove,
          )}
          {actionButton(
            clearUrgent ? t("clearSelectedUrgent") : t("markSelectedUrgent"),
            busyAction === "urgent",
            onUrgent,
            clearUrgent ? (
              <View style={selectionStyles.iconSlot}>
                <Ionicons name="flash" size={18} color={danger} style={{ opacity: 0.45 }} />
                <View
                  pointerEvents="none"
                  style={[selectionStyles.strike, { backgroundColor: danger }]}
                />
              </View>
            ) : (
              <Ionicons name="flash" size={18} color={danger} />
            ),
            danger,
          )}
          {actionButton(
            t("delete"),
            busyAction === "delete",
            onDelete,
            <Ionicons name="trash-outline" size={18} color={danger} />,
            danger,
          )}
        </View>
      </View>
    </View>
  );
}

const selectionStyles = StyleSheet.create({
  shell: {
    height: tabBar.height,
    borderRadius: tabBar.radius,
    borderWidth: tabBar.borderWidth,
    overflow: "hidden",
  },
  row: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
    padding: 6,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  iconSlot: {
    height: 22,
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: tabBar.labelSize,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: tabBar.labelSize + 2,
    width: "100%",
  },
  strike: {
    position: "absolute",
    width: 20,
    height: 2.5,
    borderRadius: 2,
    transform: [{ rotate: "-38deg" }],
  },
});

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
      className={`min-h-[76px] flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-3xl border border-cove-line px-1 py-2 ${
        disabled ? "opacity-45" : "active:opacity-80"
      }`}
    >
      <FrostedFill />
      {icon}
      <AppText
        numberOfLines={1}
        className="text-center text-xs font-semibold leading-4 text-cove-ink"
      >
        {label}
      </AppText>
    </Pressable>
  );
}
