import { caretColors, caretGap } from "@/constants/text";
import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useIsFocused } from "expo-router";
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
  FadeInLeft,
  FadeInRight,
  FadeOut,
  SlideInUp,
  SlideOutUp,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FoldPaneEmpty, FoldSplit } from "@/components/ui/FoldSplit";
import { AddItemCard } from "@/features/items/components/add-item-card";
import { CostEntrySheet } from "@/features/items/components/cost-entry-sheet";
import { ItemDetailCard } from "@/features/items/components/item-detail-card";
import { PurchaseRow } from "@/features/items/components/purchase-row";
import { QuickAddBar } from "@/features/items/components/quick-add-bar";
import { ReorderableList } from "@/features/items/components/reorderable-list";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ItemsFab } from "@/features/items/components/items-fab";
import { SwipeableItem } from "@/features/items/components/swipeable-item";
import { TripResumeSheet } from "@/features/items/components/trip-resume-sheet";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { firstName } from "@/features/items/api/shop-locks";
import { useShopLock } from "@/features/items/hooks/use-shop-lock";
import {
  readSwipeActions,
  subscribeSwipeActions,
  type SwipeAction,
  type SwipeActionPrefs,
} from "@/features/items/utils/swipe-actions";
import { AppText } from "@/components/ui/AppText";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { FormMessage } from "@/components/ui/FormMessage";
import { ListsHeaderIcon } from "@/components/ui/ListsHeaderIcon";
import { Screen, SwipeSlideContent } from "@/components/ui/Screen";
import { ShimmerBlock } from "@/components/ui/ShimmerBlock";
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
  spacing,
  tabBar,
  withAlpha,
} from "@/constants/theme";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { onFocusList, onListChanged } from "@/features/items/utils/list-sync";
import { CategoryFilter } from "@/features/items/components/category-filter";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import { ItemSuggestions } from "@/features/items/components/item-suggestions";
import { matchRank, suggestItems, type ItemSuggestion } from "@/features/items/utils/insights";
import {
  useCategories,
  useCategoryLabel,
} from "@/features/items/providers/categories-provider";
import {
  SelectionBar,
  type SelectionAction,
} from "@/features/items/components/selection-bar";
import { useUnitLabel } from "@/features/items/components/item-sheet-form";
import { allSelected, sharedValue } from "@/features/items/utils/selection";
import { getCategoryLabel } from "@/constants/categories";
import type { Purchase, PurchaseCategory } from "@/features/items/types/purchase";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { ViewHandle } from "@/lib/native-refs";

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
    setManyCategory,
    setManyUnit,
    updateItem,
    reorderNeeded,
    addItem,
  } = usePurchases();
  const { colors, scheme } = useTheme();
  const { setHidden: setTabBarHidden } = useTabBarVisibility();
  const { t, isRTL } = useI18n();
  const { categories } = useCategories();
  const unitLabel = useUnitLabel();
  const wide = useWideLayout();
  const insets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const { scale } = useFontScale();
  const quickInputStyle = {
    ...singleLineInput,
    fontSize: scaleFontSize(Number(singleLineInput.fontSize), scale),
  };
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<SelectionAction | null>(null);
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
  // The list just swiped to and the side it slid in from; its rows stagger in.
  const [arrival, setArrival] = useState<{
    listId: string;
    from: "left" | "right";
  } | null>(null);
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
  // The filtered category was removed (here or on another phone): back to all,
  // instead of an empty list and adds that fail.
  if (quickCategory !== "all" && !categories.some((entry) => entry.id === quickCategory)) {
    setQuickCategory("all");
  }
  const [isChoosingCategory, setIsChoosingCategory] = useState(false);
  const [categoryAnchor, setCategoryAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const categoryButtonRef = useRef<ViewHandle>(null);
  const [isAddingDetails, setIsAddingDetails] = useState(false);
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [bulkCostIds, setBulkCostIds] = useState<string[] | null>(null);
  const multiMemberHome = (household?.members.length ?? 0) > 1;
  const isFocused = useIsFocused();
  const {
    lock: shopLock,
    blockedByOther: shopBlocked,
    refresh: refreshShopLock,
  } = useShopLock({
    homeId: household?.id,
    listId: selectedListId,
    // Only while this tab is showing: no requests from behind another page.
    enabled: multiMemberHome && isFocused,
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
  // Typing in the add bar also searches: the list narrows to matching items
  // (in any category) and past purchases are offered below the bar.
  const typed = quickName.trim();
  const shownItems = useMemo(
    () => (typed ? listItems.filter((item) => matchRank(item.name, typed) > 0) : visibleItems),
    [listItems, typed, visibleItems],
  );
  const suggestions = useMemo(
    () => suggestItems(purchases, typed, { exclude: listItems.map((item) => item.name) }),
    [listItems, purchases, typed],
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
  const addCategory: PurchaseCategory =
    quickCategory === "all" ? "other" : quickCategory;
  const isSelecting = selectedIds.size > 0;
  const selectedItems = useMemo(
    () => needed.filter((item) => selectedIds.has(item.id)),
    [needed, selectedIds],
  );
  const allSelectedUrgent =
    selectedItems.length > 0 && selectedItems.every((item) => item.urgent);
  const selectedCategory = sharedValue(selectedItems, (item) => item.category);
  const selectedUnit = sharedValue(selectedItems, (item) => item.unit ?? "");

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
        return cached;
      }
      setActionError(result.error);
      return null;
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
    return result.lists;
  }

  const loadListsRef = useRef(loadLists);
  useLayoutEffect(() => {
    loadListsRef.current = loadLists;
  });

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

    // Pins belong to a list: an item counts as pinned only on the same list.
    const pinKey = (listId: string | null | undefined, name: string) =>
      `${listId ?? ""}:${name.trim().toLowerCase()}`;
    const pinned = new Set(existing.pins.map((pin) => pinKey(pin.listId, pin.name)));
    const toPin = selected.filter((item) => !pinned.has(pinKey(item.listId, item.name)));
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
        listId: item.listId,
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
    const result = await markManyBought(entries, { joinInvoice: true });
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

  async function setCategoryForIds(ids: string[], category: PurchaseCategory) {
    if (busyAction || ids.length === 0) return;
    setBusyAction("category");
    setActionError(null);
    const result = await setManyCategory(ids, category);
    setBusyAction(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    // Rows don't show their category, so the change is confirmed in words.
    const entry = categories.find((item) => item.id === category);
    const name = entry?.builtin === false ? (entry.name ?? category) : getCategoryLabel(category);
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setFloatTone("success");
    setFloatMessage(t("categorySetNotice", { name }));
  }

  async function setUnitForIds(ids: string[], unit: string) {
    if (busyAction || ids.length === 0) return;
    setBusyAction("unit");
    setActionError(null);
    const result = await setManyUnit(ids, unit);
    setBusyAction(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSelectedIds(new Set());
    setIsConfirmingDelete(false);
    setFloatTone("success");
    setFloatMessage(t("unitSetNotice", { name: unitLabel(unit) }));
  }

  /** Everything on screen: the current list, narrowed by the category filter or search. */
  function selectAllShown() {
    void Haptics.selectionAsync();
    setSelectedIds(new Set(shownItems.map((item) => item.id)));
    setActionError(null);
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
    // What was open or filtered belongs to the previous home (its categories
    // and items don't exist in this one).
    if (listsHomeId !== undefined) {
      setQuickCategory("all");
      setOpenItemId(null);
      setBulkCostIds(null);
    }
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

  // A tapped notification asks for its list (the home switch happens first).
  useEffect(
    () =>
      onFocusList((focusHomeId, listId) => {
        if (focusHomeId !== homeId) return;
        if (lists.some((list) => list.id === listId)) {
          setSelectedListId(listId);
          return;
        }
        // A list this phone hasn't seen yet (someone just made it): fetch, then show it.
        void loadListsRef.current(focusHomeId).then((loaded) => {
          if (loaded?.some((list) => list.id === listId)) setSelectedListId(listId);
        });
      }),
    [homeId, lists],
  );

  // Lists change on other phones too (a new one, a rename, a delete): reload
  // them whenever the items are reloaded (back in the app, a notification).
  useEffect(() => {
    if (!homeId) return;
    return onListChanged(() => void loadListsRef.current(homeId));
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
      // Screen slides "next" in from the right (physical), "previous" from the left.
      setArrival({ listId: next.id, from: direction === "next" ? "right" : "left" });
      setSelectedListId(next.id);
      setSelectedIds(new Set());
      setOpenSwipeId(null);
      void Haptics.selectionAsync();
    },
    [household, isRTL, listIndex, lists],
  );

  useEffect(() => {
    if (!arrival) return;
    // Long enough for the staggered rows to mount; later rows (new items) don't animate.
    const timer = setTimeout(() => setArrival(null), 600);
    return () => clearTimeout(timer);
  }, [arrival]);

  async function addSuggestion(suggestion: ItemSuggestion) {
    if (isQuickAdding || !selectedListId) return;
    setIsQuickAdding(true);
    setActionError(null);
    setQuickName("");
    const result = await addItem({
      name: suggestion.name,
      quantity: 1,
      unit: suggestion.unit,
      category: suggestion.category,
      urgent: false,
      listId: selectedListId ?? undefined,
    });
    setIsQuickAdding(false);
    if (result.error) setActionError(result.error);
  }

  async function quickAdd() {
    const name = quickName.trim();
    if (!name || isQuickAdding || !selectedListId) return;
    setIsQuickAdding(true);
    setActionError(null);
    setQuickName("");
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
      // Not added: give the text back instead of making them type it again.
      setQuickName((current) => current || name);
    }
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
  const awaitingItems = isLoading && needed.length === 0 && !error;
  // Only a true first load (nothing saved on the phone yet) shows the skeleton.
  const showListSkeleton = awaitingItems;
  const arrivalFrom =
    arrival && arrival.listId === selectedListId ? arrival.from : null;

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

  function openCategoryMenu() {
    const node = categoryButtonRef.current;
    if (!node) {
      setIsChoosingCategory(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setCategoryAnchor({ x, y, width, height });
      setIsChoosingCategory(true);
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
              <Animated.View
                entering={FadeIn.duration(220)}
                className="mt-1 flex-row items-center gap-2"
              >
                <AppText
                  numberOfLines={1}
                  className="shrink text-sm font-medium"
                  style={{ color: headerFg }}
                >
                  {t("stillToGet", { count: listItems.length })}
                </AppText>
                <View ref={categoryButtonRef} collapsable={false} className="min-w-0 shrink">
                  <Pressable
                    onPress={openCategoryMenu}
                    accessibilityRole="button"
                    accessibilityLabel={quickCategoryLabel}
                    hitSlop={8}
                    className="flex-row items-center gap-1 rounded-full px-2.5 py-0.5 active:opacity-70"
                    style={{
                      backgroundColor: withAlpha(
                        headerFg,
                        quickCategory === "all" ? 0.1 : 0.2,
                      ),
                    }}
                  >
                    <Ionicons
                      name={quickCategory === "all" ? "grid-outline" : "grid"}
                      size={11}
                      color={headerFg}
                    />
                    <AppText
                      numberOfLines={1}
                      className="shrink text-sm font-semibold"
                      style={{ color: headerFg }}
                    >
                      {quickCategoryLabel}
                    </AppText>
                    <Ionicons name="chevron-down" size={12} color={headerFg} />
                  </Pressable>
                </View>
              </Animated.View>
            )}
          </View>
        </View>
      )}
    </ScreenHeader>
  );

  const selectionDock = isSelecting ? (
    <SelectionBar
      busyAction={busyAction}
      disabled={isApplyingAction}
      clearUrgent={allSelectedUrgent}
      canMove={lists.filter((list) => list.id !== selectedListId).length > 0}
      onBought={() => void markBoughtIds([...selectedIds])}
      onPin={() => void pinIds([...selectedIds])}
      onUrgent={() => void markUrgentIds([...selectedIds])}
      onMove={() => askMove([...selectedIds])}
      onDelete={() => askDelete([...selectedIds])}
      allSelected={allSelected(
        shownItems.map((item) => item.id),
        selectedIds,
      )}
      category={selectedCategory}
      unit={selectedUnit}
      onSelectAll={selectAllShown}
      onSetCategory={(category) =>
        void setCategoryForIds([...selectedIds], category)
      }
      onSetUnit={(unit) => void setUnitForIds([...selectedIds], unit)}
    />
  ) : null;

  const listScreen = (
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
      dock={wide ? null : selectionDock}
      fab={
        isSelecting ? null : (
          <ItemsFab
            onAdd={() => {
              setOpenItemId(null);
              setIsAddingDetails(true);
            }}
            onPins={() => router.push("/pins")}
            shopCount={visibleItems.length}
            shopDisabled={shopDisabled}
            shopLockedByName={shopBlocked ? shopLock?.shopperName : null}
            onShop={openShop}
          />
        )
      }
    >
      {isSelecting ? null : header}

      {isSelecting ? null : (
        <>
          <QuickAddBar
            value={quickName}
            onChangeText={setQuickName}
            onSubmit={() => void quickAdd()}
            busy={isQuickAdding}
            inputStyle={quickInputStyle}
            footer={
              suggestions.length > 0 ? (
                <ItemSuggestions
                  suggestions={suggestions}
                  currency={household?.currency ?? "JOD"}
                  showPrices={household?.costsEnabled === true}
                  disabled={isQuickAdding}
                  onPick={(suggestion) => void addSuggestion(suggestion)}
                />
              ) : null
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
        ) : shownItems.length === 0 ? (
          typed ? (
            <AppText className="px-3 py-4 text-center text-sm text-cove-muted">
              {t("searchNotOnList", { name: typed })}
            </AppText>
          ) : (
          <Animated.View entering={FadeIn.duration(240)}>
            <EmptyState
              title={t("nothingToBuy")}
              message={t("nothingToBuyBody")}
            />
          </Animated.View>
          )
        ) : (
          <Animated.View entering={FadeIn.duration(280)}>
          <ReorderableList
            items={shownItems}
            // A filtered list would save a partial order.
            enabled={!isSelecting && !typed}
            onDragChange={setIsDragging}
            onItemLongPress={longPressRow}
            onReorder={(ids) => void reorderNeeded(ids)}
            renderRow={(purchase, handle, index, preview) =>
              preview ? (
                <PurchaseRow
                  purchase={purchase}
                  showCategory={false}
                  leading={handle}
                  selected={
                    selectedIds.has(purchase.id) ||
                    (wide && !isSelecting && openItemId === purchase.id)
                  }
                  quantityBusy={false}
                  onChangeQuantity={
                    isSelecting
                      ? undefined
                      : (quantity) => changeRowQuantity(purchase.id, quantity)
                  }
                />
              ) : (
              <RowEntrance index={index} from={arrivalFrom}>
              <ShoppingRow
                purchase={purchase}
                index={index}
                handle={handle}
                swipeEnabled={!isSelecting && !isDragging}
                revealed={openSwipeId === purchase.id}
                leftAction={swipeActions.left}
                rightAction={swipeActions.right}
                selected={
                  selectedIds.has(purchase.id) ||
                  (wide && !isSelecting && openItemId === purchase.id)
                }
                selecting={isSelecting}
                quantityBusy={false}
                onReveal={revealRow}
                onAction={actOnRow}
                onPress={pressRow}
                onLongPress={longPressRow}
                onChangeQuantity={changeRowQuantity}
              />
              </RowEntrance>
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

      {wide ? null : (
        <AddItemCard
          visible={isAddingDetails}
          listId={selectedListId}
          initialCategory={addCategory}
          initialName={quickName}
          onClose={() => setIsAddingDetails(false)}
          onSaved={() => setQuickName("")}
        />
      )}
      {wide ? null : (
        <ItemDetailCard
          purchase={openItem}
          visible={openItem !== null}
          onClose={() => setOpenItemId(null)}
        />
      )}

      {wide ? null : (
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
      )}

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

      <BottomSheet
        visible={isMovingToList}
        locked={busyAction === "move"}
        onClose={() => {
          setIsMovingToList(false);
          setMoveIds(null);
          setActionError(null);
        }}
      >
          <View className="gap-3">
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
      </BottomSheet>

      <BottomSheet
        visible={isCreatingList}
        locked={isSavingList}
        onClose={closeListForm}
      >
          <View className="gap-4">
            <AppText className="text-xl font-semibold text-cove-ink">
              {editingListId ? t("editList") : t("newList")}
            </AppText>
            <TextInput
              maxLength={80}
              value={listName}
              onChangeText={setListName}
              placeholder={caretGap(t("listNamePlaceholder"))}
              {...caretColors(colors.accent)}
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
              className={`h-[52px] items-center justify-center rounded-2xl bg-cove-accent px-3 ${
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
      </BottomSheet>

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
      {household ? (
        <TripResumeSheet
          key={household.id}
          homeId={household.id}
          autoEndHours={household.tripAutoEndHours}
        />
      ) : null}
    </Screen>
  );

  if (!wide) return listScreen;

  const foldBarWidth = Math.min(
    tabBar.maxWidth,
    Math.max(0, windowWidth - spacing.xl * 2),
  );

  return (
    <View style={{ flex: 1 }}>
    <FoldSplit
      master={listScreen}
      detail={
        <Screen scroll={false} tabBarInset>
          {isAddingDetails ? (
            <AddItemCard
              presentation="pane"
              visible
              listId={selectedListId}
              initialCategory={addCategory}
              initialName={quickName}
              onClose={() => setIsAddingDetails(false)}
              onSaved={() => setQuickName("")}
            />
          ) : bulkCostIds !== null ? (
            <ScrollView
              className="flex-1"
              contentContainerClassName="px-4 pb-10 pt-2"
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <CostEntrySheet
                presentation="pane"
                visible
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
            </ScrollView>
          ) : openItem ? (
            <ItemDetailCard
              presentation="pane"
              purchase={openItem}
              visible
              onClose={() => setOpenItemId(null)}
            />
          ) : (
            <FoldPaneEmpty
              icon="list-outline"
              title={t("itemPickTitle")}
              body={t("itemPickBody")}
            />
          )}
        </Screen>
      }
    />
    {selectionDock ? (
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: Math.max(insets.bottom, spacing.md) + spacing.sm,
          alignItems: "center",
          zIndex: 40,
        }}
      >
        <View style={{ width: foldBarWidth }}>{selectionDock}</View>
      </View>
    ) : null}
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

/** Rows of a list just swiped to glide in from that side, one after another. */
const ENTRANCE_STAGGER_MS = 35;
const ENTRANCE_MAX_STAGGERED = 8;

function RowEntrance({
  index,
  from,
  children,
}: {
  index: number;
  from: "left" | "right" | null;
  children: ReactNode;
}) {
  // Read once at mount: rows added later in the same list don't re-animate.
  const [entering] = useState(() => {
    if (!from) return undefined;
    const base = from === "right" ? FadeInRight : FadeInLeft;
    return base
      .delay(Math.min(index, ENTRANCE_MAX_STAGGERED) * ENTRANCE_STAGGER_MS)
      .duration(380)
      .easing(Easing.out(Easing.cubic));
  });
  return <Animated.View entering={entering}>{children}</Animated.View>;
}

function ListSkeleton() {
  const { colors, scheme } = useTheme();
  const tone = scheme === "dark" ? colors.mist : "#E7EBF0";

  return (
    <View className="gap-3">
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          className="flex-row items-center gap-3 rounded-[22px] px-[18px] py-4"
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
