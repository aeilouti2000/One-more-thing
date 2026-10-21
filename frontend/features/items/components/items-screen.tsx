import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, useFocusEffect } from "expo-router";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Haptics from "expo-haptics";
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  SlideInUp,
  SlideOutUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AddItemCard } from "@/features/items/components/add-item-card";
import { CostEntrySheet } from "@/features/items/components/cost-entry-sheet";
import { ItemDetailCard } from "@/features/items/components/item-detail-card";
import { PurchaseRow } from "@/features/items/components/purchase-row";
import { QuickAddBar } from "@/features/items/components/quick-add-bar";
import { ReorderableList } from "@/features/items/components/reorderable-list";
import { ShopButton } from "@/features/items/components/shop-button";
import { SwipeableItem } from "@/features/items/components/swipeable-item";
import { firstName } from "@/features/items/api/shop-locks";
import { useShopLock } from "@/features/items/hooks/use-shop-lock";
import {
  readSwipeActions,
  subscribeSwipeActions,
  type SwipeAction,
  type SwipeActionPrefs,
} from "@/features/items/utils/swipe-actions";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { ListsHeaderIcon } from "@/components/ui/ListsHeaderIcon";
import { Screen, SwipeSlideContent } from "@/components/ui/Screen";
import { useTabBarVisibility } from "@/components/ui/TabBarVisibility";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
  createList,
  deleteList,
  fetchLists,
  listLabel,
  renameList,
  type HomeList,
} from "@/features/items/api/lists";
import {
  resolvePreferredListId,
  writeStoredListId,
} from "@/features/items/utils/list-storage";
import { readCachedLists, writeCachedLists } from "@/features/offline/profile-cache";
import {
  createPin,
  fetchPins,
  type PinInterval,
} from "@/features/items/api/pins";
import { pinnedNotice } from "@/features/items/utils/pin-notice";
import { scaleFontSize, singleLineInput } from "@/constants/font";
import { useFontScale } from "@/providers/FontScaleProvider";
import {
  iconSize,
  floatedCardStyle,
  tabBar,
  withAlpha,
} from "@/constants/theme";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { CategoryFilter } from "@/features/items/components/category-filter";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import { useCategoryLabel } from "@/features/items/providers/categories-provider";
import type { Purchase, PurchaseCategory } from "@/features/items/types/purchase";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

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
    setManyUrgent,
    updateItem,
    reorderNeeded,
    addItem,
  } = usePurchases();
  const { colors, scheme } = useTheme();
  const { setHidden: setTabBarHidden } = useTabBarVisibility();
  const { t, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const { scale } = useFontScale();
  const quickInputStyle = {
    ...singleLineInput,
    fontSize: scaleFontSize(Number(singleLineInput.fontSize), scale),
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<
    "pin" | "bought" | "delete" | "urgent" | "move" | null
  >(null);
  const isApplyingAction = busyAction !== null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isMovingToList, setIsMovingToList] = useState(false);
  const [floatMessage, setFloatMessage] = useState<string | null>(null);
  const [floatTone, setFloatTone] = useState<"error" | "success">("error");
  const itemsRef = useRef(needed);
  itemsRef.current = needed;
  const pendingQuantity = useRef(new Map<string, number>());
  const quantityJobs = useRef(new Map<string, Promise<void>>());
  const [isDragging, setIsDragging] = useState(false);
  const [swipeActions, setSwipeActions] =
    useState<SwipeActionPrefs>(readSwipeActions);
  const [openSwipeId, setOpenSwipeId] = useState<string | null>(null);
  const [confirmDeleteIds, setConfirmDeleteIds] = useState<string[] | null>(
    null,
  );
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [quickName, setQuickName] = useState("");
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [lists, setLists] = useState<HomeList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [arrivingListId, setArrivingListId] = useState<string | null>(null);
  const [isChoosingList, setIsChoosingList] = useState(false);
  const [listMenuMounted, setListMenuMounted] = useState(false);
  const listsLoadSeq = useRef(0);
  const [isCreatingList, setIsCreatingList] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [listPendingDelete, setListPendingDelete] = useState<HomeList | null>(
    null,
  );
  const [listName, setListName] = useState("");
  const [listFormError, setListFormError] = useState<string | null>(null);
  const [isSavingList, setIsSavingList] = useState(false);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [quickCategory, setQuickCategory] = useState<PurchaseCategory | "all">(
    "all",
  );
  const [isChoosingCategory, setIsChoosingCategory] = useState(false);
  const [categoryAnchor, setCategoryAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const categoryButtonRef = useRef<View>(null);
  const [isAddingDetails, setIsAddingDetails] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [bulkCostIds, setBulkCostIds] = useState<string[] | null>(null);
  const multiMemberHome = (household?.members.length ?? 0) > 1;
  const {
    lock: shopLock,
    blockedByOther: shopBlocked,
    refresh: refreshShopLock,
  } = useShopLock({
    homeId: household?.id,
    listId: selectedListId,
    enabled: multiMemberHome,
  });

  const openItem = openItemId
    ? (purchases.find((item) => item.id === openItemId) ?? null)
    : null;

  const listItems = useMemo(
    () =>
      selectedListId
        ? needed.filter((item) => item.listId === selectedListId)
        : [],
    [needed, selectedListId],
  );
  const visibleItems = useMemo(
    () =>
      quickCategory === "all"
        ? listItems
        : listItems.filter((item) => item.category === quickCategory),
    [listItems, quickCategory],
  );
  const headerButton = {
    backgroundColor: scheme === "dark" ? colors.accent : colors.white,
    icon: scheme === "dark" ? colors.onAccent : colors.accent,
  };
  const headerFg = scheme === "dark" ? colors.ink : colors.onAccent;
  const selectedCategoryLabel = useCategoryLabel(
    quickCategory === "all" ? "" : quickCategory,
  );
  const quickCategoryLabel =
    quickCategory === "all" ? t("all") : selectedCategoryLabel;
  const categoryLabelIsLong = quickCategoryLabel.trim().length > 6;
  const addCategory: PurchaseCategory =
    quickCategory === "all" ? "other" : quickCategory;
  const isSelecting = selectedIds.size > 0;
  const selectedItems = useMemo(
    () => needed.filter((item) => selectedIds.has(item.id)),
    [needed, selectedIds],
  );
  const allSelectedUrgent =
    selectedItems.length > 0 && selectedItems.every((item) => item.urgent);

  function rememberList(homeId: string, listId: string) {
    writeStoredListId(homeId, listId);
    if (listId === selectedListId) return;
    setSelectedListId(listId);
  }

  async function loadLists(homeId: string) {
    const sequence = ++listsLoadSeq.current;
    const result = await fetchLists(homeId);
    if (sequence !== listsLoadSeq.current) return;
    if (result.error) {
      const cached = readCachedLists<HomeList>(homeId);
      if (cached) {
        setLists(cached);
        setSelectedListId((current) => {
          const next =
            current && cached.some((list) => list.id === current)
              ? current
              : resolvePreferredListId(cached, homeId);
          if (next) writeStoredListId(homeId, next);
          return next;
        });
        return;
      }
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
    try {
      await Promise.all([
        refresh(),
        refreshHome(),
        household ? loadLists(household.id) : Promise.resolve(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
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
    setOpenSwipeId(null);
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

  useEffect(() => subscribeSwipeActions(setSwipeActions), []);

  const lockSwipes = isSelecting || isDragging;
  const [swipesWereLocked, setSwipesWereLocked] = useState(lockSwipes);
  if (lockSwipes !== swipesWereLocked) {
    setSwipesWereLocked(lockSwipes);
    if (lockSwipes) setOpenSwipeId(null);
  }

  function askDelete(ids: string[]) {
    if (ids.length === 0) return;
    setConfirmDeleteIds(ids);
    setActionError(null);
    setIsConfirmingDelete(true);
  }

  function askMove(ids: string[]) {
    if (ids.length === 0) return;
    if (lists.filter((list) => list.id !== selectedListId).length === 0) {
      setFloatTone("error");
      setFloatMessage(t("moveNeedsList"));
      return;
    }
    setMoveIds(ids);
    setActionError(null);
    setIsMovingToList(true);
  }

  async function pinIds(ids: string[]) {
    if (!household || ids.length === 0) return;
    setBusyAction("pin");
    setActionError(null);

    const selected = needed.filter((item) => ids.includes(item.id));
    const existing = await fetchPins(household.id);
    if (existing.error) {
      setBusyAction(null);
      setActionError(existing.error);
      return;
    }

    const pinnedNames = new Set(
      existing.pins.map((pin) => pin.name.trim().toLowerCase()),
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

    const intervalDays: PinInterval = 7;
    for (const item of toPin) {
      const result = await createPin(household.id, {
        name: item.name,
        quantity: item.quantity,
        category: item.category,
        unit: item.unit,
        urgent: item.urgent,
        intervalDays,
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
    setFloatMessage(pinnedNotice(t, intervalDays));
  }

  async function markBoughtIds(ids: string[]) {
    if (ids.length === 0) return;
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

  async function completeBulkBought(
    entries: { id: string; cost: number | null }[],
  ) {
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

  async function markUrgentIds(ids: string[]) {
    if (ids.length === 0) return;
    setBusyAction("urgent");
    setActionError(null);

    const selected = needed.filter((item) => ids.includes(item.id));
    const nextUrgent = selected.some((item) => !item.urgent);
    const targets = nextUrgent
      ? selected.filter((item) => !item.urgent)
      : selected;
    const result = await setManyUrgent(
      targets.map((item) => item.id),
      nextUrgent,
    );
    if (result.error) {
      setBusyAction(null);
      setActionError(result.error);
      return;
    }

    setBusyAction(null);
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
  }

  function changeQuantity(id: string, delta: number) {
    const item = itemsRef.current.find((purchase) => purchase.id === id);
    if (!item) return;
    const current = pendingQuantity.current.get(id) ?? item.quantity;
    const quantity = Math.min(9999, Math.max(1, current + delta));
    if (quantity === current) return;
    pendingQuantity.current.set(id, quantity);
    setActionError(null);
    const previous = quantityJobs.current.get(id) ?? Promise.resolve();
    const job = previous.then(async () => {
      const latest = itemsRef.current.find((purchase) => purchase.id === id) ?? item;
      const next = pendingQuantity.current.get(id);
      if (next === undefined) return;
      const result = await updateItem(id, {
        name: latest.name,
        quantity: next,
        category: latest.category,
        urgent: latest.urgent,
        notes: latest.notes,
      });
      const stillLatest = pendingQuantity.current.get(id) === next;
      if (stillLatest) pendingQuantity.current.delete(id);
      if (result.error && stillLatest) setActionError(result.error);
    });
    quantityJobs.current.set(id, job);
  }

  async function deleteIds(ids: string[]) {
    if (ids.length === 0) return;
    setBusyAction("delete");
    setActionError(null);
    const result = await deleteMany(ids);
    setBusyAction(null);

    if (result.error) {
      setActionError(result.error);
      return;
    }

    setSelectedIds(new Set());
    setConfirmDeleteIds(null);
    setIsConfirmingDelete(false);
  }

  async function moveIdsToList(list: HomeList) {
    const ids = moveIds ?? [...selectedIds];
    if (busyAction || ids.length === 0) return;
    setBusyAction("move");
    setActionError(null);
    const result = await moveMany(ids, list.id);
    setBusyAction(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setIsMovingToList(false);
    setMoveIds(null);
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setFloatTone("success");
    setFloatMessage(
      t("movedNotice", { name: listLabel(list.name, t("defaultList")) }),
    );
  }

  useEffect(() => {
    if (!floatMessage) return;
    const timer = setTimeout(() => setFloatMessage(null), 2500);
    return () => clearTimeout(timer);
  }, [floatMessage]);

  useEffect(() => {
    if (isChoosingList || !listMenuMounted) return;
    const timer = setTimeout(() => setListMenuMounted(false), 220);
    return () => clearTimeout(timer);
  }, [isChoosingList, listMenuMounted]);

  const homeId = household?.id ?? null;
  const [listsHomeId, setListsHomeId] = useState<string | null | undefined>(undefined);
  if (homeId !== listsHomeId) {
    setListsHomeId(homeId);
    if (!homeId) {
      setLists([]);
      setSelectedListId(null);
    } else {
      const cached = readCachedLists<HomeList>(homeId);
      if (!cached) {
        setLists([]);
        setSelectedListId(null);
      } else {
        const next =
          selectedListId && cached.some((list) => list.id === selectedListId)
            ? selectedListId
            : resolvePreferredListId(cached, homeId);
        setLists(cached);
        setSelectedListId(next);
        if (next) writeStoredListId(homeId, next);
      }
    }
  }

  useEffect(() => {
    if (!homeId) return;
    // Lists arrive after the request. The saved copy is applied during render.
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
      const subscription = BackHandler.addEventListener(
        "hardwareBackPress",
        onBackPress,
      );
      return () => subscription.remove();
    }, [isSelecting]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!multiMemberHome) return;
      void refreshShopLock();
    }, [multiMemberHome, refreshShopLock]),
  );

  const rowHandlers = useRef({
    askDelete,
    markBoughtIds,
    pinIds,
    markUrgentIds,
    askMove,
    startSelection,
    toggleSelection,
    changeQuantity,
  });
  rowHandlers.current = {
    askDelete,
    markBoughtIds,
    pinIds,
    markUrgentIds,
    askMove,
    startSelection,
    toggleSelection,
    changeQuantity,
  };

  const revealRow = useCallback((id: string, open: boolean) => {
    setOpenSwipeId((current) => (open ? id : current === id ? null : current));
  }, []);

  const actOnRow = useCallback((id: string, action: SwipeAction) => {
    const handlers = rowHandlers.current;
    setOpenSwipeId(null);
    if (action === "delete") handlers.askDelete([id]);
    else if (action === "buy") void handlers.markBoughtIds([id]);
    else if (action === "pin") void handlers.pinIds([id]);
    else if (action === "urgent") void handlers.markUrgentIds([id]);
    else handlers.askMove([id]);
  }, []);

  const pressRow = useCallback((id: string, selecting: boolean) => {
    if (selecting) rowHandlers.current.toggleSelection(id);
    else setOpenItemId(id);
  }, []);

  const longPressRow = useCallback((id: string) => {
    rowHandlers.current.startSelection(id);
  }, []);

  const changeRowQuantity = useCallback((id: string, quantity: number) => {
    void rowHandlers.current.changeQuantity(id, quantity);
  }, []);

  const listIndex = lists.findIndex((list) => list.id === selectedListId);

  const canSwipeLists = useCallback(
    (direction: "next" | "previous") => {
      if (isSelecting || isDragging || lists.length < 2 || listIndex < 0) {
        return false;
      }
      const forward = direction === "next" ? !isRTL : isRTL;
      return forward ? listIndex < lists.length - 1 : listIndex > 0;
    },
    [isDragging, isRTL, isSelecting, listIndex, lists.length],
  );

  const swipeLists = useCallback(
    (direction: "next" | "previous") => {
      if (!household) return;
      const forward = direction === "next" ? !isRTL : isRTL;
      const next = lists[listIndex + (forward ? 1 : -1)];
      if (!next) return;
      writeStoredListId(household.id, next.id);
      setArrivingListId(next.id);
      setSelectedListId(next.id);
      setSelectedIds(new Set());
      setOpenSwipeId(null);
      void Haptics.selectionAsync();
    },
    [household, isRTL, listIndex, lists],
  );

  useEffect(() => {
    if (!arrivingListId || arrivingListId !== selectedListId || isLoading) return;
    const timer = setTimeout(() => setArrivingListId(null), 420);
    return () => clearTimeout(timer);
  }, [arrivingListId, isLoading, selectedListId]);

  async function quickAdd() {
    const name = quickName.trim();
    if (!name || isQuickAdding || !selectedListId) return;
    setIsQuickAdding(true);
    setActionError(null);
    const result = await addItem({
      name,
      quantity: 1,
      category: addCategory,
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
      setLists((current) => {
        const next = current.map((list) =>
          list.id === result.list!.id ? result.list! : list,
        );
        writeCachedLists(household.id, next);
        return next;
      });
    } else {
      setLists((current) => {
        const next = [...current, result.list!];
        writeCachedLists(household.id, next);
        return next;
      });
      rememberList(household.id, result.list.id);
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
    writeCachedLists(household.id, remaining);
    setSelectedListId((current) => {
      const next = current === removedId ? (remaining[0]?.id ?? null) : current;
      if (next) writeStoredListId(household.id, next);
      return next;
    });
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setListPendingDelete(null);
    void refresh();
  }

  const currentList = lists.find((list) => list.id === selectedListId) ?? null;
  const listArriving = arrivingListId !== null && arrivingListId === selectedListId;
  const awaitingItems = isLoading && needed.length === 0 && !error;
  const showListSkeleton = awaitingItems || listArriving;

  const shopDisabled =
    showListSkeleton || visibleItems.length === 0 || !selectedListId;

  function openShop() {
    if (!selectedListId || visibleItems.length === 0) return;
    if (shopBlocked) {
      setFloatTone("error");
      setFloatMessage(
        t("shopLockedToast", {
          name: firstName(shopLock?.shopperName) || t("partner"),
        }),
      );
      return;
    }
    router.push({
      pathname: "/trip",
      params: {
        listId: selectedListId,
        listName: currentList?.name ?? "",
        category: quickCategory === "all" ? "" : quickCategory,
      },
    });
  }

  function openListMenu() {
    setListMenuMounted(true);
    setIsChoosingList(true);
  }

  function closeListMenu() {
    setIsChoosingList(false);
  }

  const header = (
    <ScreenHeader
      flush={!isSelecting}
      compact={isSelecting}
      title={
        isSelecting
          ? t("selectedCount", { count: selectedIds.size })
          : undefined
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
            <Ionicons
              name="close"
              size={iconSize.md}
              color={headerButton.icon}
            />
          </Pressable>
        ) : undefined
      }
    >
      {isSelecting ? null : (
        <View className="min-w-0 flex-1 flex-row items-center gap-3">
          <ListsHeaderIcon />
          <View className="min-w-0 flex-1">
            <View className="flex-row items-start justify-between gap-3">
              {!household && awaitingItems ? (
                <ShimmerBlock
                  width={168}
                  height={28}
                  tone={withAlpha(headerFg, 0.4)}
                />
              ) : (
                <AppText
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                  className="min-w-0 flex-1 text-3xl font-semibold tracking-tight"
                  style={{ color: headerFg }}
                >
                  {household?.name ?? t("yourItems")}
                </AppText>
              )}
              {currentList ? (
                <View className="max-w-[46%] shrink pt-2">
                  <Pressable
                    onPress={openListMenu}
                    accessibilityRole="button"
                    accessibilityLabel={t("chooseList")}
                    className="flex-row items-center gap-0.5 active:opacity-80"
                  >
                    <AppText
                      numberOfLines={1}
                      className="shrink text-base font-semibold"
                      style={{ color: headerFg }}
                    >
                      {listLabel(currentList.name, t("defaultList"))}
                    </AppText>
                    <Ionicons name="chevron-down" size={16} color={headerFg} />
                  </Pressable>
                </View>
              ) : awaitingItems ? (
                <View className="shrink pt-2">
                  <ShimmerBlock
                    width={72}
                    height={16}
                    tone={withAlpha(headerFg, 0.4)}
                  />
                </View>
              ) : null}
            </View>
            {showListSkeleton ? (
              <HeaderInfoShimmer color={headerFg} />
            ) : (
              <Animated.View entering={FadeIn.duration(220)}>
                <AppText
                  className="mt-1 text-sm font-medium"
                  style={{ color: headerFg }}
                >
                  {currentList
                    ? `${t("stillToGet", { count: listItems.length })} · ${listLabel(currentList.name, t("defaultList"))}`
                    : t("stillToGet", { count: listItems.length })}
                </AppText>
              </Animated.View>
            )}
          </View>
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
      onSwipe={swipeLists}
      canSwipe={canSwipeLists}
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
            canMove={
              lists.filter((list) => list.id !== selectedListId).length > 0
            }
            onBought={() => void markBoughtIds([...selectedIds])}
            onPin={() => void pinIds([...selectedIds])}
            onUrgent={() => void markUrgentIds([...selectedIds])}
            onMove={() => askMove([...selectedIds])}
            onDelete={() => askDelete([...selectedIds])}
          />
        ) : null
      }
    >
      {isSelecting ? null : header}

      {isSelecting ? null : (
        <>
          <QuickAddBar
            value={quickName}
            onChangeText={setQuickName}
            onSubmit={() => void quickAdd()}
            onOpenDetails={() => setIsAddingDetails(true)}
            busy={isQuickAdding}
            inputStyle={quickInputStyle}
            footer={
              <View
                className="flex-row items-center gap-2 px-3 pb-3 pt-1"
                style={{ direction: isRTL ? "rtl" : "ltr" }}
              >
                <View
                  ref={categoryButtonRef}
                  collapsable={false}
                  className={categoryLabelIsLong ? "min-w-0 flex-1" : "shrink-0"}
                >
                  <Pressable
                    onPress={() => {
                      const node = categoryButtonRef.current;
                      if (!node) {
                        setIsChoosingCategory(true);
                        return;
                      }
                      node.measureInWindow((x, y, width, height) => {
                        setCategoryAnchor({ x, y, width, height });
                        setIsChoosingCategory(true);
                      });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={quickCategoryLabel}
                    className={`${categoryLabelIsLong ? "w-full" : ""} flex-row items-center justify-center gap-1 rounded-xl px-3 py-2 active:opacity-60`}
                    style={{
                      backgroundColor: withAlpha(colors.accent, 0.12),
                      minWidth: 100,
                    }}
                  >
                    <AppText
                      numberOfLines={1}
                      className="shrink text-sm font-semibold"
                      style={{ color: colors.ink }}
                    >
                      {quickCategoryLabel}
                    </AppText>
                    <Ionicons name="chevron-down" size={14} color={colors.ink} />
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => router.push("/pins")}
                  accessibilityRole="button"
                  accessibilityLabel={t("pin")}
                  className={`${categoryLabelIsLong ? "shrink-0" : "min-w-0 flex-1"} flex-row items-center justify-center gap-1 rounded-xl px-3 py-2 active:opacity-60`}
                  style={{ backgroundColor: withAlpha(colors.accent, 0.12) }}
                >
                  <MaterialCommunityIcons name="pin" size={16} color={colors.ink} />
                  <AppText
                    numberOfLines={1}
                    className="shrink text-sm font-semibold"
                    style={{ color: colors.ink }}
                  >
                    {t("pin")}
                  </AppText>
                </Pressable>
                <ShopButton
                  count={visibleItems.length}
                  disabled={shopDisabled}
                  lockedByName={shopBlocked ? shopLock?.shopperName : null}
                  className={categoryLabelIsLong ? "shrink-0" : "min-w-0 flex-1"}
                  onPress={openShop}
                />
              </View>
            }
          />
          <CategoryFilter
            layout="none"
            manage={false}
            anchor={categoryAnchor}
            value={quickCategory}
            open={isChoosingCategory}
            onOpen={() => setIsChoosingCategory(true)}
            onClose={() => setIsChoosingCategory(false)}
            onChange={(next) => {
              setQuickCategory(next);
              setSelectedIds(new Set());
              setIsConfirmingDelete(false);
            }}
          />
        </>
      )}

      <FormMessage
        message={isConfirmingDelete ? error : (actionError ?? error)}
      />

      <SwipeSlideContent>
      <View style={{ paddingTop: 4, paddingBottom: 10 , marginHorizontal: 2}}>
        {showListSkeleton ? (
          <ListSkeleton />
        ) : visibleItems.length === 0 ? (
          <Animated.View entering={FadeIn.duration(240)}>
            <EmptyState
              title={t("nothingToBuy")}
              message={t("nothingToBuyBody")}
            />
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(280)}>
          <ReorderableList
            items={visibleItems}
            enabled={!isSelecting}
            onDragChange={setIsDragging}
            onItemLongPress={longPressRow}
            onReorder={(ids) => void reorderNeeded(ids)}
            renderRow={(purchase, handle, index, preview) =>
              preview ? (
                <PurchaseRow
                  purchase={purchase}
                  showCategory={false}
                  leading={handle}
                  selected={selectedIds.has(purchase.id)}
                  quantityBusy={false}
                  onChangeQuantity={
                    isSelecting
                      ? undefined
                      : (quantity) => changeRowQuantity(purchase.id, quantity)
                  }
                />
              ) : (
              <ShoppingRow
                purchase={purchase}
                index={index}
                handle={handle}
                swipeEnabled={!isSelecting && !isDragging}
                revealed={openSwipeId === purchase.id}
                leftAction={swipeActions.left}
                rightAction={swipeActions.right}
                selected={selectedIds.has(purchase.id)}
                selecting={isSelecting}
                quantityBusy={false}
                onReveal={revealRow}
                onAction={actOnRow}
                onPress={pressRow}
                onLongPress={longPressRow}
                onChangeQuantity={changeRowQuantity}
              />
              )
            }
          />
          </Animated.View>
        )}
      </View>
      </SwipeSlideContent>

      <ConfirmModal
        visible={isConfirmingDelete}
        title={t("deleteItemsTitle")}
        message={t("deleteItemsMessage", {
          count: confirmDeleteIds?.length ?? selectedIds.size,
        })}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
        error={actionError}
        loading={isApplyingAction}
        onConfirm={() => void deleteIds(confirmDeleteIds ?? [...selectedIds])}
        onCancel={() => {
          setConfirmDeleteIds(null);
          setIsConfirmingDelete(false);
          setActionError(null);
        }}
      />

      <AddItemCard
        visible={isAddingDetails}
        listId={selectedListId}
        initialCategory={addCategory}
        initialName={quickName}
        onClose={() => setIsAddingDetails(false)}
        onSaved={() => setQuickName("")}
      />
      <ItemDetailCard
        purchase={openItem}
        visible={openItem !== null}
        onClose={() => setOpenItemId(null)}
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
          void completeBulkBought(
            (bulkCostIds ?? []).map((id) => ({ id, cost: null })),
          )
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
          setMoveIds(null);
          setActionError(null);
        }}
      >
        <View className="flex-1 items-center justify-center px-6">
          <BlurBackdrop
            onPress={() => {
              if (busyAction === "move") return;
              setIsMovingToList(false);
              setMoveIds(null);
              setActionError(null);
            }}
            disabled={busyAction === "move"}
          />
          <View
            className="w-full max-w-md gap-3 overflow-hidden rounded-3xl p-5"
            style={floatedCardStyle(scheme, colors)}
          >
            <GlassFill soft neutral />
            <AppText className="text-xl font-semibold text-cove-ink">
              {t("moveToList")}
            </AppText>
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
                    onPress={() => void moveIdsToList(list)}
                    accessibilityRole="button"
                    accessibilityLabel={listLabel(list.name, t("defaultList"))}
                    className={`mb-1 h-12 flex-row items-center gap-3 rounded-2xl px-3 ${
                      busyAction === "move" ? "opacity-45" : "active:opacity-80"
                    }`}
                    style={{
                      backgroundColor:
                        scheme === "dark" ? colors.mist : "#F4F5F7",
                    }}
                  >
                    <Ionicons
                      name="list-outline"
                      size={20}
                      color={colors.accent}
                    />
                    <AppText
                      numberOfLines={1}
                      className="min-w-0 flex-1 text-base text-cove-ink"
                    >
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
            <GlassFill soft neutral />
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
                !listName.trim() || isSavingList
                  ? "opacity-45"
                  : "active:opacity-80"
              }`}
            >
              {isSavingList ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <AppText
                  className="text-sm font-semibold"
                  style={{ color: colors.onAccent }}
                >
                  {editingListId ? t("saveChanges") : t("createList")}
                </AppText>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={listMenuMounted}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={closeListMenu}
      >
        <View className="flex-1" style={{ direction: isRTL ? "rtl" : "ltr" }}>
          {isChoosingList ? (
            <Animated.View
              entering={FadeIn.duration(160)}
              exiting={FadeOut.duration(160)}
              style={StyleSheet.absoluteFill}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("close")}
                onPress={closeListMenu}
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: "rgba(0, 0, 0, 0.4)" },
                ]}
              />
            </Animated.View>
          ) : null}
          {isChoosingList ? (
            <Animated.View
              entering={SlideInUp.duration(220)}
              exiting={SlideOutUp.duration(180)}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                maxHeight: windowHeight * 0.72,
                backgroundColor: colors.paper,
                borderBottomLeftRadius: 28,
                borderBottomRightRadius: 28,
                paddingTop: insets.top + 12,
                paddingBottom: 8,
                shadowColor: "#000000",
                shadowOffset: { width: 0, height: 10 },
                shadowOpacity: 0.16,
                shadowRadius: 18,
                elevation: 8,
              }}
            >
              <View className="flex-row items-center justify-between px-5 pb-2">
                <AppText className="text-base font-semibold text-cove-ink">
                  {t("yourLists")}
                </AppText>
                <Pressable
                  onPress={closeListMenu}
                  accessibilityRole="button"
                  accessibilityLabel={t("close")}
                  hitSlop={10}
                  className="h-9 w-9 items-center justify-center active:opacity-70"
                >
                  <Ionicons name="chevron-up" size={20} color={colors.muted} />
                </Pressable>
              </View>
              <ScrollView
                keyboardShouldPersistTaps="handled"
                bounces={false}
                style={{ flexGrow: 0 }}
              >
                {lists.map((list) => {
                  const selected = list.id === selectedListId;
                  const label = listLabel(list.name, t("defaultList"));
                  return (
                    <View
                      key={list.id}
                      className="flex-row items-center"
                      style={{
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.line,
                      }}
                    >
                      <Pressable
                        onPress={() => {
                          if (household) rememberList(household.id, list.id);
                          setSelectedIds(new Set());
                          closeListMenu();
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        className="h-14 min-w-0 flex-1 flex-row items-center gap-3 px-5 active:opacity-80"
                      >
                        <AppText
                          numberOfLines={1}
                          className={`min-w-0 flex-1 text-base ${selected ? "font-semibold" : "font-medium"}`}
                          style={{ color: colors.ink }}
                        >
                          {label}
                        </AppText>
                        {selected ? (
                          <Ionicons
                            name="checkmark"
                            size={18}
                            color={colors.accent}
                          />
                        ) : null}
                      </Pressable>
                      <Pressable
                        onPress={() => openRenameList(list)}
                        accessibilityRole="button"
                        accessibilityLabel={t("editListName")}
                        hitSlop={6}
                        className="h-14 w-11 items-center justify-center active:opacity-70"
                      >
                        <Ionicons
                          name="create-outline"
                          size={18}
                          color={colors.muted}
                        />
                      </Pressable>
                      <Pressable
                        onPress={() => askDeleteList(list)}
                        accessibilityRole="button"
                        accessibilityLabel={t("deleteList")}
                        hitSlop={6}
                        className="h-14 w-11 items-center justify-center active:opacity-70"
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color="#F87171"
                        />
                      </Pressable>
                    </View>
                  );
                })}
                <Pressable
                  onPress={openCreateList}
                  accessibilityRole="button"
                  accessibilityLabel={t("newList")}
                  className="h-14 flex-row items-center gap-2 px-5 active:opacity-80"
                  style={{
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: colors.line,
                  }}
                >
                  <Ionicons name="add" size={20} color={colors.accent} />
                  <AppText
                    className="text-base font-semibold"
                    style={{ color: colors.accent }}
                  >
                    {t("newList")}
                  </AppText>
                </Pressable>
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

function ShimmerBlock({
  width,
  height,
  tone,
  highlight = "rgba(255,255,255,0.72)",
}: {
  width: number;
  height: number;
  tone: string;
  highlight?: string;
}) {
  const travel = useSharedValue(0);
  useEffect(() => {
    travel.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.cubic) }),
      -1,
      false,
    );
  }, [travel]);
  const sheen = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(travel.value, [0, 1], [-width * 0.7, width]) },
    ],
  }));

  return (
    <View
      style={{
        width,
        height,
        borderRadius: height / 2,
        overflow: "hidden",
        backgroundColor: tone,
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            width: Math.max(36, width * 0.62),
          },
          sheen,
        ]}
      >
        <LinearGradient
          colors={["transparent", highlight, "transparent"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

function HeaderInfoShimmer({ color }: { color: string }) {
  const tone = withAlpha(color, 0.2);
  const highlight = withAlpha(color, 0.78);

  return (
    <View className="mt-2 flex-row items-center gap-2">
      <ShimmerBlock width={118} height={11} tone={tone} highlight={highlight} />
      <View
        style={{
          width: 3,
          height: 3,
          borderRadius: 2,
          backgroundColor: withAlpha(color, 0.45),
        }}
      />
      <ShimmerBlock width={52} height={11} tone={tone} highlight={highlight} />
    </View>
  );
}

function ListSkeleton() {
  const { colors, scheme } = useTheme();
  const tone = scheme === "dark" ? colors.mist : "#E7EBF0";

  return (
    <View className="gap-3">
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          className="flex-row items-center gap-3 rounded-2xl px-[18px] py-4"
          style={{ backgroundColor: colors.paper }}
        >
          <View className="min-w-0 flex-1 gap-2.5">
            <ShimmerBlock width={index % 2 === 0 ? 168 : 132} height={14} tone={tone} />
            <ShimmerBlock width={index % 2 === 0 ? 96 : 72} height={10} tone={tone} />
          </View>
          <ShimmerBlock width={32} height={32} tone={tone} />
        </View>
      ))}
    </View>
  );
}

type ShoppingRowProps = {
  purchase: Purchase;
  index: number;
  handle: ReactNode;
  swipeEnabled: boolean;
  revealed: boolean;
  leftAction: SwipeAction;
  rightAction: SwipeAction;
  selected: boolean;
  selecting: boolean;
  quantityBusy: boolean;
  onReveal: (id: string, open: boolean) => void;
  onAction: (id: string, action: SwipeAction) => void;
  onPress: (id: string, selecting: boolean) => void;
  onLongPress: (id: string) => void;
  onChangeQuantity: (id: string, quantity: number) => void;
};

const ShoppingRow = memo(function ShoppingRow({
  purchase,
  handle,
  swipeEnabled,
  revealed,
  leftAction,
  rightAction,
  selected,
  selecting,
  quantityBusy,
  onReveal,
  onAction,
  onPress,
  onLongPress,
  onChangeQuantity,
}: ShoppingRowProps) {
  return (
    <SwipeableItem
      enabled={swipeEnabled}
      revealed={revealed}
      leftAction={leftAction}
      rightAction={rightAction}
      onReveal={(open) => onReveal(purchase.id, open)}
      onAction={(action) => onAction(purchase.id, action)}
    >
      <PurchaseRow
        purchase={purchase}
        showCategory={false}
        leading={selecting ? null : handle}
        selected={selected}
        onLongPress={() => onLongPress(purchase.id)}
        onPress={() => onPress(purchase.id, selecting)}
        quantityBusy={quantityBusy}
        onChangeQuantity={
          selecting ? undefined : (quantity) => onChangeQuantity(purchase.id, quantity)
        }
      />
    </SwipeableItem>
  );
}, shoppingRowPropsEqual);

function shoppingRowPropsEqual(prev: ShoppingRowProps, next: ShoppingRowProps) {
  return (
    prev.purchase === next.purchase &&
    prev.index === next.index &&
    prev.swipeEnabled === next.swipeEnabled &&
    prev.revealed === next.revealed &&
    prev.leftAction === next.leftAction &&
    prev.rightAction === next.rightAction &&
    prev.selected === next.selected &&
    prev.selecting === next.selecting &&
    prev.quantityBusy === next.quantityBusy &&
    prev.onReveal === next.onReveal &&
    prev.onAction === next.onAction &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onChangeQuantity === next.onChangeQuantity
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
              adjustsFontSizeToFit
              minimumFontScale={0.75}
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
            backgroundColor: withAlpha(
              dark ? colors.deep : colors.mist,
              dark ? 0.55 : 0.72,
            ),
          },
        ]}
      >
        <GlassFill soft screenBlur />
        <View style={selectionStyles.row}>
          {actionButton(
            t("markSelectedBought"),
            busyAction === "bought",
            onBought,
            <MaterialCommunityIcons
              name="cart-check"
              size={20}
              color={actionColor}
            />,
            actionColor,
          )}
          {actionButton(
            t("pinSelected"),
            busyAction === "pin",
            onPin,
            <View
              style={{ transform: [{ rotate: isRTL ? "28deg" : "-28deg" }] }}
            >
              <MaterialCommunityIcons
                name="pin"
                size={18}
                color={actionColor}
              />
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
                <Ionicons
                  name="flash"
                  size={18}
                  color={danger}
                  style={{ opacity: 0.45 }}
                />
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
