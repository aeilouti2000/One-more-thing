import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FoldPaneEmpty, FoldSplit } from "@/components/ui/FoldSplit";
import { FormMessage } from "@/components/ui/FormMessage";
import { HomeIcon } from "@/components/ui/HomeIcon";
import { IconSheet } from "@/components/ui/IconSheet";
import { Screen, useSwipeSlideStyle } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SheetField } from "@/components/ui/SheetField";
import { headerIconFrameStyle, iconSize, spacing } from "@/constants/theme";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useLoadIcons } from "@/features/icons/use-icons";
import { fetchPurchasesPage, type HistoryTrip } from "@/features/items/api/history";
import { fetchHistoryLists, fetchLists, listLabel, type HistoryList, type HomeList } from "@/features/items/api/lists";
import { HeaderSwitch, type HistoryMode } from "@/features/items/components/history/header-switch";
import {
  currentMonth,
  HistoryNote,
  previousMonth,
  monthTitle,
  ROW_FADE_MS,
  SkeletonRows,
} from "@/features/items/components/history/history-parts";
import { useInvoicesPage } from "@/features/items/components/history/invoices-page";
import { historyListLabel, OptionMenu, type Anchor } from "@/features/items/components/history/option-menu";
import { FilterChip, usePurchasesPage } from "@/features/items/components/history/purchases-page";
import { formatTripWhen, InvoiceView } from "@/features/items/components/history/trip-invoice";
import { ItemDetailCard } from "@/features/items/components/item-detail-card";
import { PurchaseRow } from "@/features/items/components/purchase-row";
import { RecapCard } from "@/features/items/components/recap-card";
import { TripInvoiceCosts } from "@/features/items/components/trip-invoice-costs";
import { useExportPurchases } from "@/features/items/hooks/use-export";
import { reloadHistory, useHistoryFreshness } from "@/features/items/hooks/use-history-freshness";
import { useHistoryPurchases } from "@/features/items/hooks/use-history-purchases";
import { useHistoryTrip, useHistoryTrips } from "@/features/items/hooks/use-history-trips";
import { useHistoryMonths, useMonthStats } from "@/features/items/hooks/use-month-stats";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import type { Purchase } from "@/features/items/types/purchase";
import { formatMoney, summarizeSpend } from "@/features/items/utils/currency";
import { collectAllPages, monthOptions, stepMonth } from "@/features/items/utils/history";
import { localPurchases, localStats, localTripItems, localTrips } from "@/features/items/utils/history-local";
import { canUndoBought } from "@/features/items/utils/share-list";
import { isOnline } from "@/features/offline/network";
import { readCachedHistoryLists, readCachedLists } from "@/features/offline/saved";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { formatAppError } from "@/lib/errors";
import type { ViewHandle } from "@/lib/native-refs";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Typing waits this long before the server is asked (spec 5.2). */
const SEARCH_WAIT_MS = 300;

type PageModel = {
  key: string;
  header: ReactNode;
  rows: readonly { key: string }[];
  renderRow: (row: never) => ReactElement | null;
  onEndReached?: () => void;
};

/**
 * History: Purchases and Invoices, browsed by month (one selected month for
 * both pages), read from the server page by page. Each page is one FlatList
 * whose header holds the coloured band, the switch and the page's controls.
 */
export default function HistoryScreen() {
  const { bought, refresh, undoBought, addItem, deleteMany, renameTrip, moveToTrip } = usePurchases();
  const { household } = useHousehold();
  const { t, locale, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const wide = useWideLayout();
  const homeId = household?.id ?? null;
  const costsEnabled = household?.costsEnabled === true;
  const currency = household?.currency ?? "JOD";

  const [focused, setFocused] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<HistoryMode>("list");
  const [month, setMonth] = useState(currentMonth);
  const [category, setCategory] = useState<string | null>(null);
  const [listId, setListId] = useState<string>("all");
  const [searching, setSearching] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [buyAgainId, setBuyAgainId] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<Purchase | null>(null);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; itemIds: string[]; listId: string | null } | null>(null);
  const [tripName, setTripName] = useState("");
  const [movingItem, setMovingItem] = useState<Purchase | null>(null);
  const [tripBusy, setTripBusy] = useState(false);
  const [tripError, setTripError] = useState<string | null>(null);
  const [shopIcon, setShopIcon] = useState<string | null>(null);
  const [iconAfterRename, setIconAfterRename] = useState(false);
  const [activeLists, setActiveLists] = useState<HomeList[]>([]);
  const [historyLists, setHistoryLists] = useState<HistoryList[]>([]);
  const [listsOpen, setListsOpen] = useState(false);
  const [listAnchor, setListAnchor] = useState<Anchor | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const listChipRef = useRef<ViewHandle>(null);
  const listRef = useRef<FlatList<{ key: string }>>(null);
  const slideRef = useRef<((direction: "next" | "previous") => boolean) | null>(null);
  const { exportItems, isExporting } = useExportPurchases();
  useLoadIcons();

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      // "Today" and this month follow the clock when the app comes back the next day.
      setNow(Date.now());
      return () => setFocused(false);
    }, []),
  );
  useHistoryFreshness(homeId, focused);

  // Another home: start again from its current month.
  const [seenHome, setSeenHome] = useState<string | null>(homeId);
  if (homeId !== seenHome) {
    setSeenHome(homeId);
    setMonth(currentMonth());
    setCategory(null);
    setListId("all");
    setOpenTripId(null);
    setOpenItem(null);
    setActiveLists(homeId ? (readCachedLists<HomeList>(homeId) ?? []) : []);
    setHistoryLists(homeId ? (readCachedHistoryLists<HistoryList>(homeId) ?? []) : []);
  }

  useFocusEffect(
    useCallback(() => {
      if (!homeId) return;
      let cancelled = false;
      void Promise.all([fetchLists(homeId), fetchHistoryLists(homeId)]).then(([active, history]) => {
        if (cancelled) return;
        if (!active.error) setActiveLists(active.lists);
        if (!history.error) setHistoryLists(history.lists);
      });
      return () => {
        cancelled = true;
      };
    }, [homeId]),
  );

  // Typing waits 300 ms before the server is asked.
  useEffect(() => {
    const value = searchText.trim();
    const timer = setTimeout(() => setQuery(value), value ? SEARCH_WAIT_MS : 0);
    return () => clearTimeout(timer);
  }, [searchText]);

  const thisMonth = currentMonth();
  const { months: serverMonths } = useHistoryMonths(homeId);
  const months = monthOptions(
    serverMonths?.map((entry) => entry.month),
    thisMonth,
  );
  const older = stepMonth(months, month, "older");
  const newer = stepMonth(months, month, "newer");
  const title = monthTitle(month, locale);
  const filterListId = listId === "all" ? null : listId;
  const monthStats = useMonthStats(homeId, month);
  const serverPurchases = useHistoryPurchases(homeId, {
    month,
    listId: filterListId,
    category,
    q: searching ? query : "",
  });
  const serverTrips = useHistoryTrips(homeId, month, filterListId, costsEnabled && mode === "invoice");
  const serverTrip = useHistoryTrip(homeId, openTripId);

  // This month and last month are on the phone anyway (the saved items): offline,
  // before their pages were ever loaded, they are shown from there.
  const onPhone = month === thisMonth || month === previousMonth();
  const stats =
    monthStats.stats ??
    (onPhone && monthStats.waitingOffline ? localStats(bought, month, household?.monthlyBudget ?? null) : null);
  const purchasesList =
    onPhone && !serverPurchases.loaded && serverPurchases.waitingOffline && !(searching && query)
      ? {
          ...serverPurchases,
          purchases: localPurchases(bought, month, { listId: filterListId, category }),
          loaded: true,
          hasMore: false,
          waitingOffline: false,
        }
      : serverPurchases;
  const tripsList =
    onPhone && !serverTrips.loaded && serverTrips.waitingOffline
      ? { ...serverTrips, trips: localTrips(bought, month, filterListId), loaded: true, hasMore: false, waitingOffline: false }
      : serverTrips;
  const localTrip = !serverTrip.detail && serverTrip.waitingOffline && openTripId ? localTripItems(bought, openTripId) : null;
  const tripDetail = localTrip
    ? {
        ...serverTrip,
        waitingOffline: false,
        detail: {
          trip: {
            id: localTrip.id,
            name: localTrip.name,
            listId: localTrip.items[0]?.listId ?? null,
            listName: localTrip.listName || null,
            total: localTrip.items.find((item) => typeof item.receiptTotal === "number")?.receiptTotal ?? null,
            startedAt: localTrip.startedAt,
            lastBoughtAt: localTrip.items[0]?.boughtAt ?? localTrip.startedAt,
          },
          items: localTrip.items,
        },
      }
    : serverTrip;
  // Move targets ignore the list filter: any trip of the same month.
  const moveTrips = useHistoryTrips(homeId, month, null, movingItem !== null);

  const hasUndo = purchasesList.purchases.some((item) => canUndoBought(item.boughtAt, now));
  useEffect(() => {
    if (!hasUndo) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasUndo]);

  if (!costsEnabled && mode === "invoice") setMode("list");

  const filterLists = (() => {
    const byId = new Map<string, HistoryList>();
    for (const list of historyLists) byId.set(list.id, list);
    // Fallback: lists seen on loaded purchases, if the history-lists answer is missing.
    const activeIds = new Set(activeLists.map((list) => list.id));
    for (const item of purchasesList.purchases) {
      if (!item.listId || byId.has(item.listId)) continue;
      byId.set(item.listId, { id: item.listId, name: item.listName ?? "List", deleted: !activeIds.has(item.listId) });
    }
    return [...byId.values()].sort((a, b) => {
      if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  })();
  if (listId !== "all" && historyLists.length > 0 && !filterLists.some((list) => list.id === listId)) {
    setListId("all");
  }

  function chooseMonth(next: string | null) {
    if (!next || next === month) return;
    setMonth(next);
    setCategory(null);
    setOpenTripId(null);
    void Haptics.selectionAsync();
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  function toggleSearch() {
    if (searching) {
      setSearching(false);
      setSearchText("");
      setQuery("");
      return;
    }
    setSearching(true);
    setSearchText("");
    void Haptics.selectionAsync();
  }

  function openLists() {
    const node = listChipRef.current;
    if (!node) {
      setListsOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setListAnchor({ x, y, width, height });
      setListsOpen(true);
    });
  }

  async function undo(id: string) {
    if (undoId) return;
    setUndoId(id);
    setMessage(null);
    const result = await undoBought(id);
    setUndoId(null);
    if (result.error) setMessage(result.error);
    reloadHistory(homeId);
  }

  async function buyAgain(purchase: Purchase) {
    if (buyAgainId) return;
    setBuyAgainId(purchase.id);
    setMessage(null);
    setNotice(null);
    const listStillActive = !!purchase.listId && activeLists.some((list) => list.id === purchase.listId);
    const result = await addItem({
      name: purchase.name,
      quantity: purchase.quantity,
      category: purchase.category,
      unit: purchase.unit,
      notes: purchase.notes,
      listId: listStillActive ? purchase.listId : undefined,
    });
    setBuyAgainId(null);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setNotice(t("boughtAgain"));
  }

  async function exportMonth() {
    if (!homeId || csvBusy || isExporting) return;
    if (!isOnline()) {
      setMessage(t("historyExportOffline"));
      return;
    }
    setMessage(null);
    setCsvBusy(true);
    try {
      // No export endpoint: the month's purchases, 100 a page, make the file here.
      const items = await collectAllPages((before) =>
        fetchPurchasesPage(homeId, { month, listId: filterListId, category }, before, 100),
      );
      const result = await exportItems(items, title);
      if (result.error) setMessage(result.error);
    } catch (error) {
      setMessage(formatAppError(error));
    } finally {
      setCsvBusy(false);
    }
  }

  async function onRefresh() {
    setIsRefreshing(true);
    try {
      reloadHistory(homeId);
      await refresh();
      if (homeId) {
        const [active, history] = await Promise.all([fetchLists(homeId), fetchHistoryLists(homeId)]);
        if (!active.error) setActiveLists(active.lists);
        if (!history.error) setHistoryLists(history.lists);
      }
    } finally {
      setIsRefreshing(false);
    }
  }

  // The item and trip shown: the freshest copy among the loaded pages.
  const shownItem = openItem
    ? (purchasesList.purchases.find((item) => item.id === openItem.id) ??
      tripDetail.detail?.items.find((item) => item.id === openItem.id) ??
      openItem)
    : null;
  const detail = tripDetail.detail;

  function startRename(trip: { id: string; name: string | null; listId: string | null }, itemIds: string[]) {
    setTripError(null);
    setTripName(trip.name ?? "");
    setRenaming({ id: trip.id, itemIds, listId: trip.listId });
  }

  async function saveTripName() {
    if (!renaming || tripBusy) return;
    setTripBusy(true);
    setTripError(null);
    const result = await renameTrip(
      { receiptId: renaming.id, itemIds: renaming.itemIds, listId: renaming.listId },
      tripName,
    );
    setTripBusy(false);
    reloadHistory(homeId);
    if (result.error) {
      setTripError(result.error);
      return;
    }
    setRenaming(null);
    // Named so that it can have an icon: go on to the icon now.
    if (iconAfterRename && tripName.trim()) setShopIcon(tripName.trim());
    setIconAfterRename(false);
  }

  async function moveItemTo(trip: HistoryTrip) {
    if (!movingItem || tripBusy) return;
    setTripBusy(true);
    setTripError(null);
    const result = await moveToTrip(movingItem.id, { receiptId: trip.id, itemIds: [], listId: trip.listId });
    setTripBusy(false);
    reloadHistory(homeId);
    if (result.error) {
      setTripError(result.error);
      return;
    }
    setMovingItem(null);
    void Haptics.selectionAsync();
  }

  function deleteItem(item: Purchase) {
    return deleteMany([item.id]).then((result) => {
      reloadHistory(homeId);
      return result;
    });
  }

  const backToTrips = (
    <Pressable
      onPress={() => {
        setOpenTripId(null);
        setOpenItem(null);
      }}
      accessibilityRole="button"
      accessibilityLabel={t("invoiceAllTrips")}
      className="mb-3 flex-row items-center gap-1 self-start active:opacity-80"
    >
      <Ionicons name={isRTL ? "chevron-forward" : "chevron-back"} size={iconSize.sm} color={colors.accentText} />
      <AppText className="text-sm font-semibold text-cove-accent-text">{t("invoiceAllTrips")}</AppText>
    </Pressable>
  );

  let tripView: ReactElement | null = null;
  if (openTripId) {
    if (detail) {
      const spend = summarizeSpend(detail.items);
      const when = formatTripWhen(detail.trip.startedAt, locale);
      const itemIds = detail.items.map((item) => item.id);
      tripView = (
        <View>
          {wide ? null : backToTrips}
          <InvoiceView
            items={detail.items}
            currency={currency}
            periodTitle={detail.trip.name ?? when}
            listTitle={`${detail.trip.name ? `${when} · ` : ""}${listLabel(detail.trip.listName ?? "", t("defaultList"))}`}
            locale={locale}
            total={detail.trip.total ?? spend.total}
            priced={spend.priced}
            count={detail.items.length}
            onPressItem={(purchase) => setOpenItem(purchase)}
            onRename={() => startRename(detail.trip, itemIds)}
            shopName={detail.trip.name}
            onChangeIcon={() => {
              if (detail.trip.name?.trim()) {
                setShopIcon(detail.trip.name.trim());
                return;
              }
              setIconAfterRename(true);
              startRename(detail.trip, itemIds);
            }}
            onMoveItem={(purchase) => {
              setTripError(null);
              setMovingItem(purchase);
            }}
            actions={<TripInvoiceCosts items={detail.items} currency={currency} onInvoice={() => reloadHistory(homeId)} />}
          />
        </View>
      );
    } else {
      tripView = (
        <View>
          {wide ? null : backToTrips}
          {tripDetail.waitingOffline ? (
            <HistoryNote icon="cloud-offline-outline" text={t("historyOfflineTrip")} />
          ) : tripDetail.failed ? (
            <HistoryNote icon="alert-circle-outline" text={t("historyLoadFailed")} />
          ) : (
            <SkeletonRows count={4} />
          )}
        </View>
      );
    }
  }

  const listChip = (
    <FilterChip
      chipRef={listChipRef}
      label={
        listId === "all"
          ? t("allLists")
          : historyListLabel(filterLists.find((list) => list.id === listId), t("defaultList"), t("deletedList"))
      }
      selected={listId !== "all"}
      trailing="chevron-down"
      onPress={openLists}
    />
  );

  const purchasesPage = usePurchasesPage({
    month,
    title,
    stats,
    list: purchasesList,
    costsEnabled,
    currency,
    canOlder: older !== null,
    canNewer: newer !== null,
    onOlder: () => chooseMonth(older),
    onNewer: () => chooseMonth(newer),
    category,
    onCategory: setCategory,
    listChip,
    searching,
    searchText,
    query,
    onSearchText: setSearchText,
    onToggleSearch: toggleSearch,
    exporting: csvBusy || isExporting,
    onExport: costsEnabled ? () => void exportMonth() : undefined,
    top:
      month === thisMonth && !searching && !category && listId === "all" ? (
        <RecapCard purchases={bought} now={now} />
      ) : null,
    renderPurchase: (purchase) => (
      <PurchaseRow
        purchase={purchase}
        categoryIcon
        selected={wide && openItem?.id === purchase.id}
        onPress={() => setOpenItem(purchase)}
        onUndo={
          canUndoBought(purchase.boughtAt, now) && undoId !== purchase.id ? () => void undo(purchase.id) : undefined
        }
        buyAgainBusy={buyAgainId === purchase.id}
        onBuyAgain={() => void buyAgain(purchase)}
      />
    ),
  });

  const invoicesPage = useInvoicesPage({
    months,
    month,
    title,
    onMonth: chooseMonth,
    stats,
    list: tripsList,
    currency,
    listChip,
    filtered: filterListId !== null,
    openTripId,
    wide,
    tripDetail: tripView,
    onOpenTrip: (trip) => {
      setOpenTripId(trip.id);
      setOpenItem(null);
      void Haptics.selectionAsync();
    },
  });

  const page: PageModel = mode === "invoice" ? invoicesPage : purchasesPage;
  const renderRow = page.renderRow as (row: { key: string }) => ReactElement | null;

  const canSwipeMode = (direction: "next" | "previous") => {
    if (!costsEnabled || searching) return false;
    const toInvoice = direction === "next" ? !isRTL : isRTL;
    return toInvoice ? mode === "list" : mode === "invoice";
  };

  const onSwipeMode = (direction: "next" | "previous") => {
    if (!costsEnabled) return;
    const toInvoice = direction === "next" ? !isRTL : isRTL;
    setMode(toInvoice ? "invoice" : "list");
    setOpenTripId(null);
    void Haptics.selectionAsync();
  };

  const band = (
    <ScreenHeader
      title={mode === "invoice" ? t("invoiceTitle") : t("historyTitle")}
      subtitle={mode === "invoice" ? t("invoiceSubtitle") : t("historySubtitle")}
      icon={
        <View className="items-center justify-center" style={headerIconFrameStyle(scheme, colors)}>
          <Ionicons
            name={mode === "invoice" ? "receipt-outline" : "time-outline"}
            size={34}
            color={scheme === "dark" ? colors.ink : colors.onAccent}
          />
        </View>
      }
      footer={
        costsEnabled ? (
          <HeaderSwitch
            value={mode}
            label={t("historyTitle")}
            options={[
              { id: "list", label: t("historyPurchasesTab"), icon: "list-outline" },
              { id: "invoice", label: t("historyInvoicesTab"), icon: "receipt-outline" },
            ]}
            onChange={(next) => {
              // Same slide as a finger swipe; it switches the view half-way.
              const toInvoice = next === "invoice";
              const direction = toInvoice === !isRTL ? "next" : "previous";
              if (!searching && slideRef.current?.(direction)) return;
              setMode(next);
              setOpenTripId(null);
              // Search only finds single purchases.
              setSearching(false);
              setSearchText("");
              setQuery("");
              void Haptics.selectionAsync();
            }}
          />
        ) : null
      }
    />
  );

  const listScreen = (
    <Screen
      tabBarInset
      virtualized
      onSwipe={costsEnabled ? onSwipeMode : undefined}
      canSwipe={costsEnabled ? canSwipeMode : undefined}
      slideRef={slideRef}
    >
      <FlatList
        ref={listRef}
        data={page.rows}
        keyExtractor={(row) => row.key}
        renderItem={({ item, index }) => (
          <SlideRow rowKey={`${page.key}:${item.key}`} index={index}>
            {renderRow(item)}
          </SlideRow>
        )}
        ListHeaderComponent={
          <View>
            {band}
            <SlideRow rowKey="header" index={0} still>
              <FormMessage message={message} onDismiss={() => setMessage(null)} />
              <FormMessage message={notice} tone="success" onDismiss={() => setNotice(null)} />
              {page.header}
            </SlideRow>
          </View>
        }
        onEndReached={page.onEndReached}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{
          paddingHorizontal: spacing.screen,
          paddingTop: spacing.sm,
          paddingBottom: 128,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accentText}
            colors={[colors.accentText]}
            progressBackgroundColor={scheme === "dark" ? colors.deep : colors.white}
          />
        }
      />

      {wide ? null : (
        <ItemDetailCard
          purchase={shownItem}
          visible={shownItem !== null}
          onClose={() => setOpenItem(null)}
          onDelete={shownItem ? () => deleteItem(shownItem) : undefined}
        />
      )}

      <IconSheet
        target={shopIcon ? { kind: "shop", name: shopIcon } : null}
        title={shopIcon ?? ""}
        onClose={() => setShopIcon(null)}
      />

      <BottomSheet
        visible={renaming !== null}
        locked={tripBusy}
        onClose={() => {
          setRenaming(null);
          setIconAfterRename(false);
        }}
      >
        <View className="gap-4">
          <AppText className="text-xl font-semibold text-cove-ink">{t("renameTrip")}</AppText>
          <AppText className="text-sm text-cove-muted">
            {iconAfterRename ? t("iconNameTripFirst") : t("renameTripBody")}
          </AppText>
          <SheetField
            value={tripName}
            onChangeText={setTripName}
            placeholder={t("tripNamePlaceholder")}
            icon="storefront-outline"
            maxLength={80}
            autoFocus
            onSubmitEditing={() => void saveTripName()}
          />
          <FormMessage message={tripError} />
          <Pressable
            disabled={tripBusy}
            onPress={() => void saveTripName()}
            className={`h-[52px] items-center justify-center rounded-2xl bg-cove-accent px-3 ${
              tripBusy ? "opacity-45" : "active:opacity-80"
            }`}
          >
            {tripBusy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <AppText className="text-sm font-semibold" style={{ color: colors.onAccent }}>
                {t("saveChanges")}
              </AppText>
            )}
          </Pressable>
        </View>
      </BottomSheet>

      <BottomSheet visible={movingItem !== null} locked={tripBusy} onClose={() => setMovingItem(null)}>
        <View className="gap-3">
          <AppText className="text-xl font-semibold text-cove-ink">{t("moveToTrip")}</AppText>
          <AppText className="text-sm text-cove-muted">
            {t("moveToTripBody", { item: movingItem?.name ?? "" })}
          </AppText>
          {!moveTrips.loaded ? (
            moveTrips.waitingOffline ? (
              <AppText className="py-2 text-sm text-cove-muted">{t("historyOfflineMonth", { month: title })}</AppText>
            ) : (
              <ActivityIndicator color={colors.accentText} />
            )
          ) : moveTrips.trips.filter((trip) => trip.id !== openTripId).length === 0 ? (
            <AppText className="py-2 text-sm text-cove-muted">{t("moveToTripNone")}</AppText>
          ) : (
            moveTrips.trips
              .filter((trip) => trip.id !== openTripId)
              .map((trip) => (
                <Pressable
                  key={trip.id}
                  disabled={tripBusy}
                  onPress={() => void moveItemTo(trip)}
                  accessibilityRole="button"
                  className="flex-row items-center justify-between gap-3 rounded-2xl px-4 py-3 active:opacity-80"
                  style={{ backgroundColor: colors.mist }}
                >
                  <HomeIcon kind="shop" name={trip.name} size={36} background={colors.paper} />
                  <View className="min-w-0 flex-1">
                    <AppText className="text-base font-semibold text-cove-ink" numberOfLines={1}>
                      {trip.name ?? formatTripWhen(trip.startedAt, locale)}
                    </AppText>
                    <AppText className="mt-1 text-xs text-cove-muted" numberOfLines={1}>
                      {trip.name ? `${formatTripWhen(trip.startedAt, locale)} · ` : ""}
                      {t("invoiceTripCount", { count: trip.itemCount })}
                    </AppText>
                  </View>
                  <AppText className="text-sm font-semibold" style={{ color: colors.accentText }}>
                    {formatMoney(trip.total, currency)}
                  </AppText>
                </Pressable>
              ))
          )}
          {tripBusy ? <ActivityIndicator color={colors.accentText} /> : null}
          <FormMessage message={tripError} />
        </View>
      </BottomSheet>

      <OptionMenu
        visible={listsOpen}
        anchor={listAnchor}
        isRTL={isRTL}
        options={[
          { id: "all", label: t("allLists") },
          ...filterLists.map((list) => ({
            id: list.id,
            label: historyListLabel(list, t("defaultList"), t("deletedList")),
          })),
        ]}
        selectedId={listId}
        onSelect={(id) => {
          setListId(id);
          setOpenTripId(null);
        }}
        onClose={() => setListsOpen(false)}
      />
    </Screen>
  );

  if (!wide) return listScreen;

  return (
    <FoldSplit
      master={listScreen}
      detail={
        <Screen scroll={false} tabBarInset>
          {shownItem ? (
            <View className="flex-1">
              {mode === "invoice" && openTripId ? (
                <Pressable
                  onPress={() => setOpenItem(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t("back")}
                  className="mb-1 flex-row items-center gap-1 self-start px-4 pt-2 active:opacity-80"
                >
                  <Ionicons
                    name={isRTL ? "chevron-forward" : "chevron-back"}
                    size={iconSize.sm}
                    color={colors.accentText}
                  />
                  <AppText className="text-sm font-semibold text-cove-accent-text">{t("back")}</AppText>
                </Pressable>
              ) : null}
              <ItemDetailCard
                presentation="pane"
                purchase={shownItem}
                visible
                onClose={() => setOpenItem(null)}
                onDelete={() => deleteItem(shownItem)}
              />
            </View>
          ) : mode === "invoice" && tripView ? (
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View className="gap-3 px-4 pb-10 pt-2">
                <Pressable
                  onPress={() => {
                    setOpenTripId(null);
                    setOpenItem(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t("invoiceAllTrips")}
                  className="flex-row items-center gap-1 self-start active:opacity-80"
                >
                  <Ionicons
                    name={isRTL ? "chevron-forward" : "chevron-back"}
                    size={iconSize.sm}
                    color={colors.accentText}
                  />
                  <AppText className="text-sm font-semibold text-cove-accent-text">{t("invoiceAllTrips")}</AppText>
                </Pressable>
                {tripView}
              </View>
            </ScrollView>
          ) : (
            <FoldPaneEmpty
              icon={mode === "invoice" ? "receipt-outline" : "time-outline"}
              title={mode === "invoice" ? t("tripPickTitle") : t("historyPickTitle")}
              body={mode === "invoice" ? t("tripPickBody") : t("historyPickBody")}
            />
          )}
        </Screen>
      }
    />
  );
}

/** Rows already shown once do not fade in again when the list redraws them. */
const shownRows = new Set<string>();

/**
 * One part of the list: follows the swipe between pages, and fades in the
 * first time it appears (280 ms, a few rows staggered). Animations off: no fade.
 */
function SlideRow({
  rowKey,
  index,
  still = false,
  children,
}: {
  rowKey: string;
  index: number;
  /** Never fades in (the header). */
  still?: boolean;
  children: ReactNode;
}) {
  const slide = useSwipeSlideStyle();
  const motionOff = useMotionOff();
  const [fresh] = useState(() => !still && !shownRows.has(rowKey));
  useEffect(() => {
    shownRows.add(rowKey);
  }, [rowKey]);
  return (
    <Animated.View style={slide}>
      <Animated.View
        entering={fresh && !motionOff ? FadeIn.duration(ROW_FADE_MS).delay(Math.min(index, 10) * 30) : undefined}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
