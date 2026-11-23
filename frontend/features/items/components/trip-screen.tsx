import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { RequireSession } from "@/features/auth/components/require-session";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { CostEntrySheet } from "@/features/items/components/cost-entry-sheet";
import { ItemPhotoThumb, ItemPhotoViewer, itemPhotoUri } from "@/features/items/components/item-photo";
import { ReceiptSourceModal } from "@/features/items/components/receipt-source-modal";
import { AppButton } from "@/components/ui/AppButton";
import { SheetField } from "@/components/ui/SheetField";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCategoryLabel } from "@/constants/categories";
import { useCategories } from "@/features/items/providers/categories-provider";
import { headerActionStyle, iconSize } from "@/constants/theme";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import { listLabel } from "@/features/items/api/lists";
import {
  claimShopLock,
  fetchShopLock,
  firstName,
  heartbeatShopLock,
  releaseShopLock,
  SHOP_LOCK_HEARTBEAT_MS,
  SHOP_TOGETHER_REFRESH_MS,
  type ShopLock,
} from "@/features/items/api/shop-locks";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { AskHomeCard } from "@/features/items/components/ask-home-card";
import {
  Flyer,
  TripDockCard,
  type Flight,
  type PendingPrice,
  type Rect,
} from "@/features/items/components/trip-price-dock";
import { askHome, endShopAsk, SHOP_ASK_POLL_MS } from "@/features/items/api/shop-asks";
import { adoptShopAsk, dropShopAsk, useShopAsks } from "@/features/items/hooks/use-shop-asks";
import { formatMoney } from "@/features/items/utils/currency";
import { currentMonth, summarizeMonth } from "@/features/items/utils/insights";
import {
  formatTripMinutes,
  formatTripShare,
  lastPrices,
  priceOf,
  rememberedPrice,
  savedShopNames,
  summarizeTrip,
  tripBudget,
  tripDoneItems,
  tripProgress,
  type TripSummary,
} from "@/features/items/utils/trip-helpers";
import {
  clearStoredTrip,
  holdTipSeen,
  markHoldTipSeen,
  readStoredTrip,
  setTripPageOpen,
  writeStoredTrip,
  type StoredTrip,
} from "@/features/items/utils/trip-session";
import { canUndoBought, formatNeededShare, shareNeededText } from "@/features/items/utils/share-list";
import { pickReceiptPhoto, interpretReceiptPhoto, type ReceiptScan } from "@/features/items/utils/scan-receipt";
import { translate } from "@/constants/i18n";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Purchase } from "@/features/items/types/purchase";
import type { ViewHandle } from "@/lib/native-refs";
import { isOnline, onOnlineChange } from "@/features/offline/network";

const ROW_GAP = 12;
const CHECK_SIZE = iconSize.md;
const LEAVE_DELAY = 140;
const LEAVE_MS = 380;
const TRIP_REFRESH_MS = 5000;

/** How long a "Sara got Bread" note stays up. */
const NOTE_MS = 2600;
/** Two sheets can't swap in one frame: let the first one close. */
const SHEET_SWAP_MS = 350;

/** How long the floating Undo toast stays up after a check. */
const UNDO_TOAST_MS = 5000;
/** A saved price takes this long to fly into the total before it counts. */
const PRICE_LAND_MS = 420;
/** Space under the trip card's slot in the list. */
const DOCK_GAP = 20;
/** Row id for the single "Total paid" field in trip-total mode. */
const TRIP_TOTAL_ROW_ID = "trip-total";

export default function TripScreen() {
  return (
    <RequireSession requireHome>
      <TripBody />
    </RequireSession>
  );
}

function TripBody() {
  const {
    needed,
    bought,
    isLoading,
    error,
    refresh,
    markBought,
    undoBought,
    updateCosts,
    saveTripTotal,
    renameTrip,
    setNotFound,
  } =
    usePurchases();
  const { household } = useHousehold();
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { t, locale, isRTL } = useI18n();
  // Leaves the trip (the page uses the stack's normal animation).
  const closePage = useCallback(() => router.back(), []);
  const { categories } = useCategories();
  const { colors, scheme } = useTheme();
  const headerAction = headerActionStyle(scheme, colors);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const params = useLocalSearchParams<{
    listId?: string;
    listName?: string;
    category?: string;
    /** "1": continue the trip kept on the phone (the app closed mid-trip). */
    resume?: string;
    /** "1": with resume, go straight to the end-of-trip steps. */
    end?: string;
  }>();
  const listId = typeof params.listId === "string" && params.listId.length > 0 ? params.listId : null;
  const category =
    typeof params.category === "string" && params.category.length > 0 ? params.category : null;
  const listName =
    typeof params.listName === "string" && params.listName.length > 0
      ? listLabel(params.listName, t("defaultList"))
      : null;
  const homeId = household?.id ?? null;
  // A trip kept on the phone, when this page continues one.
  const [resumed] = useState<StoredTrip | null>(() => {
    if (params.resume !== "1" || !homeId || !listId) return null;
    const trip = readStoredTrip(homeId);
    return trip && trip.listId === listId ? trip : null;
  });
  const endRequested = resumed !== null && params.end === "1";
  const [startedAt] = useState(() => resumed?.startedAt ?? Date.now());
  // Opening the trip (again) is activity too: a continued trip must not end
  // itself a few minutes after it was picked back up.
  const lastActivityRef = useRef(Date.now());
  const [actionError, setActionError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sessionBoughtIds, setSessionBoughtIds] = useState<string[]>(
    () => resumed?.boughtIds ?? [],
  );
  const [tripCostOpen, setTripCostOpen] = useState(false);
  // Bought items waiting in the trip card for their price.
  const [pending, setPending] = useState<PendingPrice[]>([]);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [leaveAskOpen, setLeaveAskOpen] = useState(false);
  const [isKeepingPrices, setIsKeepingPrices] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dockHeight, setDockHeight] = useState(0);
  const scrollY = useSharedValue(0);
  const dockSlotY = useSharedValue(-1);
  const overlayRef = useRef<ViewHandle>(null);
  const dockRef = useRef<ViewHandle>(null);
  const estimateRef = useRef<ViewHandle>(null);
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [scanPhase, setScanPhase] = useState<"picking" | "reading" | null>(null);
  const [receiptCover, setReceiptCover] = useState(false);
  const [receiptSourceOpen, setReceiptSourceOpen] = useState(false);
  const [receiptScan, setReceiptScan] = useState<ReceiptScan | null>(null);
  const [frozenTripCostItems, setFrozenTripCostItems] = useState<
    { id: string; name: string; quantity?: number; initialCost?: number | null }[] | null
  >(null);
  const [sessionNames, setSessionNames] = useState(
    () => new Map<string, string>(resumed?.names ?? []),
  );
  // People seen shopping this list during the trip (for the summary).
  const [partners, setPartners] = useState<string[]>(() => resumed?.partners ?? []);
  const [lockView, setLockView] = useState<ShopLock | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notedIds = useRef(new Set<string>());
  const finishedRef = useRef(false);
  const inflightChecks = useRef(0);
  const undoing = useRef(false);
  const allowLeaveRef = useRef(false);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tripCostOpenRef = useRef(false);

  const tripItems = useMemo(
    () =>
      needed.filter((item) => {
        if (listId && item.listId !== listId) return false;
        if (category && item.category !== category) return false;
        return true;
      }),
    [category, listId, needed],
  );

  // "Couldn't find it" items drop to their own group at the bottom.
  const activeItems = useMemo(() => tripItems.filter((item) => !item.notFoundAt), [tripItems]);
  const notFoundItems = useMemo(() => tripItems.filter((item) => item.notFoundAt), [tripItems]);

  const recent = bought.find((item) => item.id === undoId && canUndoBought(item.boughtAt, now));
  const urgent = useMemo(() => activeItems.filter((item) => item.urgent), [activeItems]);
  const groups = useMemo(() => {
    const known = new Set(categories.map((entry) => entry.id));
    // A category this phone hasn't loaded yet (a partner just made it): its
    // items still have to be shoppable, so they go under "Other".
    const unknown = activeItems.filter((item) => !item.urgent && !known.has(item.category));
    const built = categories.map((entry) => ({
      id: entry.id,
      title: entry.builtin ? getCategoryLabel(entry.id, locale) : (entry.name ?? entry.id),
      items: activeItems.filter((item) => !item.urgent && item.category === entry.id),
    }));
    if (unknown.length > 0) {
      const other = built.find((group) => group.id === "other");
      if (other) other.items = [...other.items, ...unknown];
      else built.push({ id: "other", title: getCategoryLabel("other", locale), items: unknown });
    }
    return built.filter((group) => group.items.length > 0);
  }, [activeItems, categories, locale]);

  const costsEnabled = household?.costsEnabled === true;
  const currency = household?.currency ?? "JOD";
  const prices = useMemo(() => lastPrices(bought), [bought]);
  const lastPriceLabel = useCallback(
    (item: Purchase) => {
      if (!costsEnabled) return null;
      const price = rememberedPrice(prices, item.name, item);
      if (!price) return null;
      // Several pieces: say what one cost, which is what was remembered.
      const amount =
        price.each !== null && price.each !== price.cost
          ? t("priceEach", { price: formatMoney(price.each, currency) })
          : formatMoney(price.cost, currency);
      return t("lastTimePrice", { price: amount });
    },
    [costsEnabled, currency, prices, t],
  );
  // Everything bought on this list since the trip started, by anyone.
  const doneItems = useMemo(
    () => tripDoneItems(bought, { listId, category, startedAt }),
    [bought, category, listId, startedAt],
  );
  // "Couldn't find it" items stay on the list but aren't expected in the basket.
  const progress = useMemo(
    () => ({
      ...tripProgress(doneItems, activeItems, prices),
      total: doneItems.length + tripItems.length,
    }),
    [activeItems, doneItems, prices, tripItems.length],
  );
  // The whole trip's expected cost, and what it leaves of the month's budget.
  const showForecast = costsEnabled && household?.tripEstimate !== false;
  const monthSpent = useMemo(
    () => (showForecast ? summarizeMonth(bought, currentMonth(new Date(startedAt))).total : 0),
    [bought, showForecast, startedAt],
  );
  const forecast = useMemo(() => {
    if (!showForecast) return null;
    const priced = progress.total - notFoundItems.length - progress.unpriced;
    if (priced <= 0) return null;
    return {
      // Nothing left to buy: the whole trip is what is already in the basket.
      whole: activeItems.length > 0 ? progress.expected : null,
      unpriced: progress.unpriced,
      budget: tripBudget({
        budget: household?.monthlyBudget,
        monthSpent,
        expected: progress.expected,
        recorded: progress.recorded,
      }),
    };
  }, [activeItems.length, household?.monthlyBudget, monthSpent, notFoundItems.length, progress, showForecast]);

  const askCostOnCheck =
    household?.costsEnabled === true && household.askCostOnSingleBuy !== false;

  // Only what is still part of this trip: an undone item drops out by itself.
  const visiblePending = useMemo(
    () => pending.filter((entry) => sessionBoughtIds.includes(entry.id)),
    [pending, sessionBoughtIds],
  );
  const openPending = useMemo(
    () => visiblePending.filter((entry) => !entry.saving),
    [visiblePending],
  );
  const pendingCountRef = useRef(0);
  useLayoutEffect(() => {
    pendingCountRef.current = visiblePending.length;
  });
  // A waiting item adds nothing to "so far" until its price is in.
  const heldBack = useMemo(() => {
    let sum = 0;
    let priced = 0;
    for (const entry of visiblePending) {
      const item = doneItems.find((row) => row.id === entry.id);
      if (!item) continue;
      const own = typeof item.cost === "number" && Number.isFinite(item.cost) ? item.cost : null;
      const amount = own ?? priceOf(prices, item.name, item);
      if (amount === null) continue;
      sum += amount;
      priced += 1;
    }
    return { sum, priced };
  }, [doneItems, prices, visiblePending]);
  const soFar =
    costsEnabled && (progress.estimated - heldBack.priced > 0 || visiblePending.length > 0)
      ? Math.max(0, Math.round((progress.estimate - heldBack.sum) * 1000) / 1000)
      : null;

  const unpricedSessionIds = useMemo(
    () =>
      sessionBoughtIds.filter((id) => {
        const item = bought.find((row) => row.id === id);
        return !item || item.cost === null || item.cost === undefined;
      }),
    [bought, sessionBoughtIds],
  );

  const liveTripCostItems = useMemo(
    () =>
      unpricedSessionIds.map((id) => {
        const item = bought.find((row) => row.id === id);
        return {
          id,
          name: sessionNames.get(id) ?? item?.name ?? id,
          quantity: item?.quantity,
          initialCost: item?.cost,
        };
      }),
    [bought, sessionNames, unpricedSessionIds],
  );

  const tripCostItems = frozenTripCostItems ?? liveTripCostItems;

  // "total" mode: one receipt total for the trip instead of per-item prices.
  const tripTotalMode = household?.tripCostMode === "total";
  const [frozenTotalIds, setFrozenTotalIds] = useState<string[] | null>(null);
  const tripTotalItems = useMemo(
    () => [{ id: TRIP_TOTAL_ROW_ID, name: t("tripTotalLabel") }],
    [t],
  );

  // Two separate settings: "Trip total only" asks for one total on its own;
  // "Ask prices at end of trip" asks per item.
  const askTripCosts =
    household?.costsEnabled === true &&
    (tripTotalMode
      ? sessionBoughtIds.length > 0
      : household.askCostOnTripEnd !== false && unpricedSessionIds.length > 0);

  useEffect(() => {
    tripCostOpenRef.current = tripCostOpen;
  }, [tripCostOpen]);

  useEffect(() => {
    if (!undoId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const hide = setTimeout(() => setUndoId(null), UNDO_TOAST_MS);
    return () => {
      clearInterval(timer);
      clearTimeout(hide);
    };
  }, [undoId]);

  const multiMemberHome = (household?.members.length ?? 0) > 1;
  const shopTogether = multiMemberHome && household?.tripShopTogether === true;
  // "Anything missing?": ask the rest of the home, and see who answered.
  const askEnabled = multiMemberHome && household?.tripAskHome !== false && listId !== null;
  const { asks, refresh: refreshAsks } = useShopAsks(homeId, askEnabled);
  const myAsk = useMemo(
    () => asks.find((ask) => ask.mine && ask.listId === listId) ?? null,
    [asks, listId],
  );
  const myAskId = myAsk?.id ?? null;
  const myAskRef = useRef(myAskId);
  useEffect(() => {
    myAskRef.current = myAskId;
  }, [myAskId]);
  /** Nobody needs to answer a trip that is over. */
  const endMyAsk = useCallback(() => {
    const askId = myAskRef.current;
    if (!askId) return;
    myAskRef.current = null;
    void endShopAsk(askId);
    dropShopAsk(askId);
  }, []);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  // Only while a question is open does the trip check for answers.
  useEffect(() => {
    if (!myAskId) return;
    const timer = setInterval(() => refreshAsks(true), SHOP_ASK_POLL_MS);
    return () => clearInterval(timer);
  }, [myAskId, refreshAsks]);
  // Someone answered by adding items: load them now, not at the next sync.
  const addedByOthers = myAsk ? myAsk.replies.reduce((sum, reply) => sum + reply.added, 0) : 0;
  const seenAdded = useRef(addedByOthers);
  useEffect(() => {
    if (addedByOthers > seenAdded.current) void refresh();
    seenAdded.current = addedByOthers;
  }, [addedByOthers, refresh]);
  const askTheHome = useCallback(async () => {
    if (!homeId || !listId || isAsking) return;
    setIsAsking(true);
    setAskError(null);
    const result = await askHome(homeId, listId);
    setIsAsking(false);
    if (result.error || !result.ask) {
      setAskError(result.error ?? translate("errorGeneric"));
      return;
    }
    adoptShopAsk(result.ask);
  }, [homeId, isAsking, listId]);
  // Items someone else added after the question: tagged with who added them.
  const askSince = myAsk ? new Date(myAsk.createdAt).getTime() : null;
  const addedNote = useCallback(
    (item: Purchase) => {
      if (askSince === null || !item.addedById || item.addedById === userId) return null;
      const created = new Date(item.createdAt).getTime();
      if (!(created >= askSince)) return null;
      return t("askHomeJustAdded", { name: firstName(item.addedByName) || t("partner") });
    },
    [askSince, t, userId],
  );

  const lockHeldRef = useRef(false);
  /** The phone lost its connection during this trip (no signal in the shop). */
  const offlineGapRef = useRef(false);
  const newTripClaimedRef = useRef(false);
  // Others shopping this list right now (shopping together).
  const partnersNow = useMemo(
    () =>
      (lockView?.shoppers ?? [])
        .filter((shopper) => shopper.id !== userId)
        .map((shopper) => firstName(shopper.name) || t("partner")),
    [lockView, t, userId],
  );

  // A fresh lock view; also remembers who shopped with us, for the summary.
  const adoptLock = useCallback(
    (lock: ShopLock) => {
      setLockView(lock);
      const others = (lock.shoppers ?? [])
        .filter((shopper) => shopper.id !== userId)
        .map((shopper) => firstName(shopper.name) || translate("partner"));
      if (others.length === 0) return;
      setPartners((current) => {
        const missing = others.filter((name) => !current.includes(name));
        return missing.length > 0 ? [...current, ...missing] : current;
      });
    },
    [userId],
  );

  const showNote = useCallback((message: string) => {
    setNote(message);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);

  useEffect(() => {
    setTripPageOpen(true);
    return () => {
      setTripPageOpen(false);
      if (noteTimer.current) clearTimeout(noteTimer.current);
    };
  }, []);

  // A continued trip: keep only what is still bought, and bought by me.
  const resumeCheckedRef = useRef(false);
  useEffect(() => {
    if (!resumed || isLoading || resumeCheckedRef.current) return;
    resumeCheckedRef.current = true;
    setSessionBoughtIds((ids) =>
      ids.filter((id) => {
        const item = bought.find((row) => row.id === id);
        return Boolean(item) && (!item?.boughtById || item.boughtById === userId);
      }),
    );
  }, [bought, isLoading, resumed, userId]);

  // An item that left the list because someone else bought it.
  const seenTripIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (isLoading) return;
    const ids = new Set(tripItems.map((item) => item.id));
    const before = seenTripIds.current;
    seenTripIds.current = ids;
    if (!before) return;
    for (const id of before) {
      if (ids.has(id) || notedIds.current.has(id)) continue;
      const item = bought.find((row) => row.id === id);
      if (!item?.boughtById || item.boughtById === userId) continue;
      notedIds.current.add(id);
      showNote(
        t("tripPartnerGot", {
          name: firstName(item.boughtByName) || t("partner"),
          item: item.name,
        }),
      );
    }
  }, [bought, isLoading, showNote, t, tripItems, userId]);
  // Home option: ask what to call the trip (e.g. the shop) before leaving.
  const [nameOpen, setNameOpen] = useState(false);
  const [tripName, setTripName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const nameAskedRef = useRef(false);
  const nameOpenRef = useRef(false);
  useEffect(() => {
    nameOpenRef.current = nameOpen;
  }, [nameOpen]);

  // Home option: a summary card at the very end.
  const [summary, setSummary] = useState<TripSummary | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summaryShownRef = useRef(false);
  const savedNameRef = useRef<string | null>(null);
  const wantsName = household?.tripAskName === true && sessionBoughtIds.length > 0;
  const wantsSummary = household?.tripSummary !== false && sessionBoughtIds.length > 0;
  // Read when the summary opens, after prices and the name were saved.
  const summaryInputs = useRef({ doneItems, left: tripItems.length, notFoundItems, partners });
  useLayoutEffect(() => {
    summaryInputs.current = { doneItems, left: tripItems.length, notFoundItems, partners };
  });

  // Keep the trip on the phone, so it can be continued if the app closes.
  // Only this trip's own copy is ever cleared: opening a trip and leaving
  // without checking anything off keeps an older unfinished trip.
  const ownsStoredRef = useRef(resumed !== null);
  useEffect(() => {
    if (!homeId || !listId || finishedRef.current) return;
    if (sessionBoughtIds.length === 0) {
      // Everything undone (or nothing left of a continued trip): nothing to keep.
      if (ownsStoredRef.current && (!resumed || resumeCheckedRef.current)) {
        clearStoredTrip(homeId);
      }
      return;
    }
    ownsStoredRef.current = true;
    writeStoredTrip({
      homeId,
      listId,
      listName: typeof params.listName === "string" ? params.listName : "",
      category,
      startedAt,
      lastActivityAt: lastActivityRef.current,
      boughtIds: sessionBoughtIds,
      names: [...sessionNames.entries()],
      partners,
    });
  }, [category, homeId, listId, params.listName, partners, resumed, sessionBoughtIds, sessionNames, startedAt]);

  /** The trip is over: forget it on the phone, free the list, close the page. */
  function finishTrip() {
    // A second tap on "Done" must not close another page.
    if (finishedRef.current && allowLeaveRef.current) return;
    allowLeaveRef.current = true;
    finishedRef.current = true;
    if (homeId && ownsStoredRef.current) clearStoredTrip(homeId);
    if (lockHeldRef.current && homeId && listId) {
      lockHeldRef.current = false;
      void releaseShopLock(homeId, listId);
    }
    endMyAsk();
    closePage();
  }

  const finishTripRef = useRef(finishTrip);
  useLayoutEffect(() => {
    finishTripRef.current = finishTrip;
  });

  function exitTrip(options?: { skipName?: boolean }) {
    if (!options?.skipName && wantsName && !nameAskedRef.current) {
      nameAskedRef.current = true;
      setNameError(null);
      setTripName("");
      // Let a closing costs sheet finish first; two sheets can't swap in one frame.
      setTimeout(() => setNameOpen(true), tripCostOpenRef.current ? SHEET_SWAP_MS : 0);
      return;
    }
    if (wantsSummary && !summaryShownRef.current) {
      summaryShownRef.current = true;
      const delay = tripCostOpenRef.current || nameOpenRef.current ? SHEET_SWAP_MS : 0;
      setTimeout(() => {
        const inputs = summaryInputs.current;
        const built = summarizeTrip({
          done: inputs.doneItems,
          left: inputs.left,
          notFound: inputs.notFoundItems.map((item) => item.name),
          startedAt,
          endedAt: Date.now(),
          partners: inputs.partners,
        });
        setSummary({ ...built, shopName: savedNameRef.current ?? built.shopName });
        setSummaryOpen(true);
      }, delay);
      return;
    }
    finishTrip();
  }

  useFocusEffect(
    useCallback(() => {
      if (!homeId || !listId) return;

      let cancelled = false;
      lockHeldRef.current = false;
      // Only the first claim of a fresh trip clears old "not found" marks.
      const newTrip = !newTripClaimedRef.current && !resumed;
      newTripClaimedRef.current = true;

      if (!multiMemberHome) {
        // No lock to hold alone, but a new trip still starts fresh.
        if (newTrip) {
          void claimShopLock(homeId, listId, { newTrip: true }).then(() => {
            if (!cancelled) void refresh();
          });
        }
        return () => {
          cancelled = true;
        };
      }

      void (async () => {
        const claimed = await claimShopLock(homeId, listId, { newTrip });
        if (cancelled) {
          if (claimed.lock?.isMine) void releaseShopLock(homeId, listId);
          return;
        }
        if (claimed.lock) adoptLock(claimed.lock);
        if (newTrip) void refresh();
        if (claimed.lock?.active && !claimed.lock.isMine) {
          setActionError(
            t("shopLockedToast", {
              name: firstName(claimed.lock.shopperName) || t("partner"),
            }),
          );
          allowLeaveRef.current = true;
          endMyAsk();
          closePage();
          return;
        }
        if (claimed.lock?.isMine) {
          lockHeldRef.current = true;
          return;
        }
        // Network hiccup: keep shopping and retry on the next heartbeat tick.
        lockHeldRef.current = true;
      })();

      const beat = () => {
        if (AppState.currentState !== "active") return;
        if (!lockHeldRef.current) return;
        if (!isOnline()) {
          // No signal: the trip goes on from this phone, and what is bought is
          // sent later. The list is taken back when the connection returns.
          offlineGapRef.current = true;
          return;
        }
        void heartbeatShopLock(homeId, listId).then(async (result) => {
          // The trip ended while this was on its way: don't take the list back.
          if (cancelled || !lockHeldRef.current) return;
          if (result.lock?.isMine) {
            offlineGapRef.current = false;
            adoptLock(result.lock);
            return;
          }
          const retry = await claimShopLock(homeId, listId);
          if (cancelled || !lockHeldRef.current) {
            if (retry.lock?.isMine) void releaseShopLock(homeId, listId);
            return;
          }
          if (retry.lock?.isMine) {
            offlineGapRef.current = false;
            adoptLock(retry.lock);
            return;
          }
          if (!retry.lock && !isOnline()) offlineGapRef.current = true;
          if (retry.lock?.active && !retry.lock.isMine) {
            lockHeldRef.current = false;
            if (offlineGapRef.current) {
              // Someone started shopping this list while this phone had no
              // signal. Nobody is sent away mid-shop: both trips go on, and
              // everything either of them bought is kept.
              adoptLock(retry.lock);
              return;
            }
            setActionError(
              t("shopLockedToast", {
                name: firstName(retry.lock.shopperName) || t("partner"),
              }),
            );
            allowLeaveRef.current = true;
            endMyAsk();
            closePage();
          }
        });
      };
      const timer = setInterval(beat, SHOP_LOCK_HEARTBEAT_MS);
      // Back from a locked phone: renew at once, before the lock runs out.
      const appState = AppState.addEventListener("change", (state) => {
        if (state === "active") beat();
      });
      // The connection is back: take the list again before someone else does.
      const stopWatching = onOnlineChange((online) => {
        if (online) beat();
        else offlineGapRef.current = true;
      });

      return () => {
        cancelled = true;
        clearInterval(timer);
        appState.remove();
        stopWatching();
        if (lockHeldRef.current) {
          lockHeldRef.current = false;
          void releaseShopLock(homeId, listId);
        }
      };
    }, [adoptLock, closePage, homeId, listId, multiMemberHome, refresh, resumed, t]),
  );

  async function saveNameAndExit() {
    if (isSavingName) return;
    const name = tripName.trim();
    if (!name) {
      setNameOpen(false);
      exitTrip({ skipName: true });
      return;
    }
    setIsSavingName(true);
    setNameError(null);
    // The trip's invoice, when the total step just made one.
    const receiptId =
      sessionBoughtIds
        .map((id) => bought.find((item) => item.id === id)?.receiptId)
        .find((id): id is string => Boolean(id)) ?? null;
    const result = await renameTrip(
      { receiptId, itemIds: sessionBoughtIds, listId: listId || null },
      name,
    );
    setIsSavingName(false);
    if (result.error) {
      setNameError(result.error);
      return;
    }
    savedNameRef.current = name;
    setNameOpen(false);
    exitTrip({ skipName: true });
  }

  function skipName() {
    if (isSavingName) return;
    setNameOpen(false);
    exitTrip({ skipName: true });
  }

  // Home option: a trip left open ends by itself. Counted from the last
  // check-off, so a long shop that's still going isn't cut short.
  const autoEndMs = household?.tripAutoEndHours ? household.tripAutoEndHours * 3_600_000 : null;
  useEffect(() => {
    if (!autoEndMs) return;
    const check = () => {
      if (AppState.currentState !== "active") return;
      if (Date.now() - lastActivityRef.current < autoEndMs) return;
      if (inflightChecks.current > 0 || allowLeaveRef.current) return;
      // Everything checked so far is already saved; prices can be added in History.
      finishTripRef.current();
    };
    const timer = setInterval(check, 60_000);
    const subscription = AppState.addEventListener("change", check);
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [autoEndMs, homeId, listId]);

  const noteInflight = useCallback((delta: number) => {
    inflightChecks.current = Math.max(0, inflightChecks.current + delta);
  }, []);

  async function checkOff(id: string, cost: number | null = null) {
    setActionError(null);
    const item = tripItems.find((row) => row.id === id);
    if (item) {
      setSessionNames((current) => {
        const next = new Map(current);
        next.set(id, item.name);
        return next;
      });
    }
    lastActivityRef.current = Date.now();
    if (askCostOnCheck && item) {
      // A second waiting item folds them all behind the arrow.
      if (openPending.length === 1) setPendingOpen(false);
      setPending((current) =>
        current.some((entry) => entry.id === id)
          ? current
          : [...current, { id, name: item.name, remembered: priceOf(prices, item.name, item) }],
      );
    }
    // Part of this trip from the tap, and "still saving" until the answer is
    // in: the row leaves the page at once, and the item that empties the list
    // must still be counted when the trip finishes itself.
    const forget = () => setSessionBoughtIds((current) => current.filter((entry) => entry !== id));
    setSessionBoughtIds((current) => (current.includes(id) ? current : [...current, id]));
    noteInflight(1);
    let result: Awaited<ReturnType<typeof markBought>>;
    try {
      result = await markBought(id, cost);
    } finally {
      noteInflight(-1);
    }
    if (result.error) {
      forget();
      setActionError(result.error);
      return false;
    }
    if (result.takenBy) {
      // Someone shopping with us got it first: it's theirs, not part of our trip.
      forget();
      notedIds.current.add(id);
      showNote(
        t("tripPartnerGot", {
          name: firstName(result.takenBy) || t("partner"),
          item: item?.name ?? "",
        }),
      );
      return true;
    }
    // The last item finishes the trip right away, so it gets no Undo.
    const isLast = tripItems.length === 0 || tripItems.every((row) => row.id === id);
    setUndoId(isLast ? null : id);
    setNow(Date.now());
    return true;
  }

  async function undoLast() {
    if (!recent || undoing.current) return;
    undoing.current = true;
    setActionError(null);
    const result = await undoBought(recent.id, { onlyMine: true });
    undoing.current = false;
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSessionBoughtIds((current) => current.filter((id) => id !== recent.id));
    setPending((current) => current.filter((entry) => entry.id !== recent.id));
    setUndoId(null);
  }

  const removeFlight = useCallback((key: string) => {
    setFlights((current) => current.filter((flight) => flight.key !== key));
  }, []);

  /** Sends something from `from` (window coordinates) toward the trip card. */
  const launchFlight = useCallback(
    (kind: Flight["kind"], label: string, from: Rect, target: "dock" | "estimate") => {
      const root = overlayRef.current;
      const goal = (target === "estimate" ? estimateRef.current : null) ?? dockRef.current;
      if (!root || !goal || from.width <= 0) return;
      root.measureInWindow((rootX, rootY) => {
        goal.measureInWindow((x, y, width, height) => {
          const start = { ...from, x: from.x - rootX, y: from.y - rootY };
          const flight: Flight =
            kind === "row"
              ? // Lands on the card's lower edge, where its price line appears.
                {
                  key: `${kind}-${Date.now()}`,
                  kind,
                  label,
                  from: start,
                  toX: start.x,
                  toY: y - rootY + height - from.height / 2,
                }
              : {
                  key: `${kind}-${Date.now()}`,
                  kind,
                  label,
                  from: start,
                  toX: (isRTL ? x + width - from.width : x) - rootX,
                  toY: y - rootY - 4,
                };
          setFlights((current) => [...current, flight]);
        });
      });
    },
    [isRTL],
  );

  const flyRowToDock = useCallback(
    (item: Purchase, from: Rect) => launchFlight("row", item.name, from, "dock"),
    [launchFlight],
  );

  async function savePendingPrice(id: string, cost: number, from: Rect) {
    const entry = pending.find((row) => row.id === id);
    if (!entry || entry.saving) return;
    setActionError(null);
    lastActivityRef.current = Date.now();
    setPending((current) =>
      current.map((row) => (row.id === id ? { ...row, saving: true } : row)),
    );
    launchFlight("price", `${entry.name} · ${formatMoney(cost, currency)}`, from, "estimate");
    const startedAt = Date.now();
    noteInflight(1);
    let result: Awaited<ReturnType<typeof updateCosts>>;
    try {
      result = await updateCosts([{ id, cost }]);
    } finally {
      noteInflight(-1);
    }
    if (result.error) {
      setPending((current) =>
        current.map((row) => (row.id === id ? { ...row, saving: false } : row)),
      );
      setActionError(result.error);
      return;
    }
    // Count it once the price has landed on the total.
    setTimeout(
      () => setPending((current) => current.filter((row) => row.id !== id)),
      Math.max(0, PRICE_LAND_MS - (Date.now() - startedAt)),
    );
  }

  function skipPendingPrice(id: string) {
    lastActivityRef.current = Date.now();
    setPending((current) => current.filter((row) => row.id !== id));
  }

  /** "Enter prices": back to the trip, with every waiting price open. */
  function enterPrices() {
    if (isKeepingPrices) return;
    setLeaveAskOpen(false);
    setLeaveError(null);
    setPendingOpen(true);
  }

  /** "Leave anyway": waiting items keep their last price, then the trip ends. */
  async function leaveWithPending() {
    if (isKeepingPrices) return;
    const kept = openPending.flatMap((entry) =>
      entry.remembered !== null ? [{ id: entry.id, cost: entry.remembered }] : [],
    );
    if (kept.length > 0) {
      setIsKeepingPrices(true);
      setLeaveError(null);
      const result = await updateCosts(kept);
      setIsKeepingPrices(false);
      if (result.error) {
        setLeaveError(result.error);
        return;
      }
    }
    setPending([]);
    pendingCountRef.current = 0;
    setLeaveAskOpen(false);
    // Two sheets can't swap in one frame: let the question close first.
    setTimeout(() => {
      // One total for the trip is a different question: still ask it.
      if (tripTotalMode && askTripCosts) {
        setFrozenTotalIds(sessionBoughtIds);
        setTripCostOpen(true);
        return;
      }
      // They chose to leave: don't ask for the same prices again.
      exitTrip();
    }, SHEET_SWAP_MS);
  }

  async function shareList() {
    if (tripItems.length === 0) return;
    const message = formatNeededShare(tripItems, {
      title: t("shareListTitle"),
      urgent: t("urgent"),
    });
    try {
      await shareNeededText(message);
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setActionError(t("errorGeneric"));
    }
  }

  const scanning = scanPhase !== null;

  function closeSummary() {
    setSummaryOpen(false);
    finishTrip();
  }

  async function shareSummary() {
    if (!summary) return;
    const time = formatTripMinutes(summary.minutes, {
      minutes: (minutes) => t("tripMinutes", { minutes }),
      hours: (hours, minutes) => t("tripHoursMinutes", { hours, minutes }),
    });
    const message = formatTripShare(summary, {
      title: listName ? `${t("tripSummaryTitle")} · ${listName}` : t("tripSummaryTitle"),
      bought: t("tripShareBought", { count: summary.bought }),
      left: t("tripShareLeft", { count: summary.left }),
      total:
        costsEnabled && summary.priced > 0
          ? t("tripShareTotal", { amount: formatMoney(summary.total, currency) })
          : null,
      time: t("tripShareTime", { time }),
      notFound:
        summary.notFound.length > 0
          ? t("tripSummaryNotFound", { names: summary.notFound.join(", ") })
          : null,
    });
    try {
      await shareNeededText(message);
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }

  // Hold an item: "Couldn't find it here" / "Put back on the list" / "Bought it".
  const [holdItem, setHoldItem] = useState<Purchase | null>(null);
  const [tipVisible, setTipVisible] = useState(() => !holdTipSeen());
  const buyers = useRef(new Map<string, () => void>());
  const registerBuyer = useCallback((id: string, buy: (() => void) | null) => {
    if (buy) buyers.current.set(id, buy);
    else buyers.current.delete(id);
  }, []);

  const openHold = useCallback((item: Purchase) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTipVisible(false);
    markHoldTipSeen();
    setHoldItem(item);
  }, []);

  function dismissTip() {
    setTipVisible(false);
    markHoldTipSeen();
  }

  async function toggleNotFound(item: Purchase) {
    setHoldItem(null);
    setActionError(null);
    lastActivityRef.current = Date.now();
    const result = await setNotFound(item.id, !item.notFoundAt);
    if (result.error) setActionError(result.error);
  }

  function buyFromHold(item: Purchase) {
    setHoldItem(null);
    // The row plays its own check animation (and may ask for a price).
    setTimeout(() => buyers.current.get(item.id)?.(), SHEET_SWAP_MS);
  }

  function leaveTrip() {
    if (summaryOpen) {
      closeSummary();
      return;
    }
    if (holdItem) {
      setHoldItem(null);
      return;
    }
    if (isSavingCosts || scanning || receiptCover) return;
    if (nameOpen) {
      skipName();
      return;
    }
    if (leaveAskOpen) {
      enterPrices();
      return;
    }
    if (tripCostOpen) {
      setTripCostOpen(false);
      setFrozenTripCostItems(null);
      exitTrip();
      return;
    }
    // Block leave only while a check-off animation/API is in flight (not during cost prompt).
    if (inflightChecks.current > 0) return;
    if (openPending.length > 0) {
      setLeaveError(null);
      setLeaveAskOpen(true);
      return;
    }
    if (askTripCosts) {
      setFrozenTripCostItems(liveTripCostItems);
      setFrozenTotalIds(sessionBoughtIds);
      setTripCostOpen(true);
      return;
    }
    exitTrip();
  }

  const leaveTripRef = useRef(leaveTrip);
  useLayoutEffect(() => {
    leaveTripRef.current = leaveTrip;
  });

  useEffect(() => {
    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  // Faster while someone else shops the same list, so nobody buys twice.
  const refreshMs =
    shopTogether && partnersNow.length > 0 ? SHOP_TOGETHER_REFRESH_MS : TRIP_REFRESH_MS;

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        leaveTripRef.current();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      const timer = setInterval(() => {
        if (AppState.currentState !== "active") return;
        void refresh();
        // Shopping together: see who else is on this list.
        if (shopTogether && homeId && listId && lockHeldRef.current) {
          void fetchShopLock(homeId, listId).then((result) => {
            if (result.lock) adoptLock(result.lock);
          });
        }
      }, refreshMs);
      return () => {
        sub.remove();
        clearInterval(timer);
      };
    }, [adoptLock, homeId, listId, refresh, refreshMs, shopTogether]),
  );

  // End steps still to show (prices, name, summary): leaving runs them first.
  const endStepsRef = useRef(false);
  useLayoutEffect(() => {
    endStepsRef.current =
      askTripCosts ||
      summaryOpen ||
      (wantsName && !nameAskedRef.current) ||
      (wantsSummary && !summaryShownRef.current);
  });

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (event) => {
      if (allowLeaveRef.current) return;
      if (
        inflightChecks.current > 0 ||
        pendingCountRef.current > 0 ||
        tripCostOpenRef.current ||
        nameOpenRef.current ||
        endStepsRef.current
      ) {
        event.preventDefault();
        leaveTripRef.current();
        return;
      }
      // Left with nothing more to ask: the trip is over.
      finishedRef.current = true;
      if (homeId && ownsStoredRef.current) clearStoredTrip(homeId);
    });
    return unsub;
  }, [homeId, navigation]);

  // "End trip" from the Continue sheet: straight to the end steps.
  const endHandledRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!endRequested || isLoading || endHandledRef.current) return;
    if (!resumeCheckedRef.current) return;
    endHandledRef.current = true;
    // Let the page finish rising first; leaveTripRef has the latest state by then.
    endTimerRef.current = setTimeout(() => leaveTripRef.current(), 450);
  }, [endRequested, isLoading, sessionBoughtIds]);
  useEffect(
    () => () => {
      if (endTimerRef.current) clearTimeout(endTimerRef.current);
    },
    [],
  );

  // Last item checked: finish the trip automatically. leaveTrip() opens the
  // trip-costs sheet when costs are enabled, otherwise goes back to Items.
  // Only after this session checked something (opening an empty trip, or a
  // partner clearing it before you shop, doesn't bounce you out).
  const autoFinishedRef = useRef(false);
  const tripCleared =
    !isLoading && tripItems.length === 0 && sessionBoughtIds.length > 0;
  useEffect(() => {
    if (!tripCleared || autoFinishedRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      // Wait out a check still animating / saving, or prices still to confirm.
      if (inflightChecks.current > 0 || pendingCountRef.current > 0) {
        timer = setTimeout(attempt, 250);
        return;
      }
      autoFinishedRef.current = true;
      setUndoId(null);
      leaveTripRef.current();
    };
    timer = setTimeout(attempt, 0);
    return () => clearTimeout(timer);
  }, [tripCleared]);

  async function saveTripCosts(entries: { id: string; cost: number | null }[]) {
    setIsSavingCosts(true);
    setActionError(null);
    const priced = entries.filter((entry) => entry.cost !== null);
    const result = await updateCosts(priced);
    if (result.error) {
      setIsSavingCosts(false);
      setActionError(result.error);
      return;
    }
    setIsSavingCosts(false);
    setTripCostOpen(false);
    setFrozenTripCostItems(null);
    setReceiptScan(null);
    exitTrip();
  }

  async function saveTripTotalAndExit(total: number | null) {
    const itemIds = frozenTotalIds ?? sessionBoughtIds;
    if (total === null || itemIds.length === 0) {
      closeTripCosts();
      return;
    }
    setIsSavingCosts(true);
    setActionError(null);
    const result = await saveTripTotal({ total, itemIds, listId: listId || null });
    setIsSavingCosts(false);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    closeTripCosts();
  }

  function closeTripCosts() {
    setTripCostOpen(false);
    setFrozenTripCostItems(null);
    setFrozenTotalIds(null);
    setReceiptScan(null);
    exitTrip();
  }

  function chooseReceiptPhoto() {
    if (isSavingCosts || scanning || receiptCover) return;
    setReceiptCover(true);
    scanTimerRef.current = setTimeout(() => setReceiptSourceOpen(true), 320);
  }

  function closeReceiptSource() {
    setReceiptSourceOpen(false);
    setReceiptCover(false);
  }

  function startReceiptScan(source: "camera" | "library") {
    setReceiptSourceOpen(false);
    setScanPhase("picking");
    scanTimerRef.current = setTimeout(() => {
      void runReceiptScan(source);
    }, 450);
  }

  async function runReceiptScan(source: "camera" | "library") {
    setActionError(null);
    setScanPhase("picking");
    try {
      const picked = await pickReceiptPhoto(source);
      if (!picked.ok) {
        setScanPhase(null);
        setReceiptCover(false);
        if (picked.error) setActionError(t(picked.error));
        return;
      }
      setScanPhase("reading");
      const outcome = await interpretReceiptPhoto({
        uri: picked.uri,
        preferArabic: locale === "ar",
        items: tripCostItems,
      });
      setScanPhase(null);
      setReceiptCover(false);
      if (!outcome.ok) {
        setActionError(t(outcome.error));
        return;
      }
      setReceiptScan(outcome.scan);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      setScanPhase(null);
      setReceiptCover(false);
      setActionError(t("scanReceiptFailed"));
    }
  }

  if (isLoading && tripItems.length === 0 && bought.length === 0 && !error) {
    return <LoadingScreen />;
  }

  const shopChoices = household?.tripAskName ? savedShopNames(bought, tripName) : [];
  const showDock = (tripItems.length > 0 || visiblePending.length > 0) && progress.total > 0;
  const rowProps = {
    docks: askCostOnCheck,
    onFly: flyRowToDock,
    onCheck: checkOff,
    onInflight: noteInflight,
    onHold: openHold,
    registerBuyer,
    priceLabel: lastPriceLabel,
    addedNote,
    userId,
  };

  return (
    <Screen
      scrollY={scrollY}
      overlay={
        <View
          ref={overlayRef}
          collapsable={false}
          pointerEvents="box-none"
          style={StyleSheet.absoluteFill}
        >
          {showDock ? (
            <TripDockCard
              scrollY={scrollY}
              slotY={dockSlotY}
              onNaturalHeight={setDockHeight}
              dockRef={dockRef}
              estimateRef={estimateRef}
              done={progress.done}
              total={progress.total}
              soFar={soFar}
              forecast={forecast}
              currency={currency}
              pending={openPending}
              pendingOpen={pendingOpen}
              onTogglePending={() => setPendingOpen((open) => !open)}
              onSavePrice={(id, cost, from) => void savePendingPrice(id, cost, from)}
              onSkipPrice={skipPendingPrice}
            />
          ) : null}
          {flights.map((flight) => (
            <Flyer key={flight.key} flight={flight} onDone={removeFlight} />
          ))}
        </View>
      }
      floating={note ? <FloatMessage message={note} tone="success" /> : null}
      fab={
        recent && !tripCleared ? (
          <UndoToast
            key={recent.id}
            name={sessionNames.get(recent.id) ?? recent.name}
            onUndo={() => void undoLast()}
          />
        ) : null
      }
    >
      <ScreenHeader
        title={listName ?? t("tripTitle")}
        subtitle={t("tripSubtitle")}
        showBack
        onBack={leaveTrip}
        right={
          <Pressable
            onPress={() => void shareList()}
            disabled={tripItems.length === 0}
            accessibilityRole="button"
            accessibilityLabel={t("shareList")}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
            style={{ backgroundColor: headerAction.backgroundColor }}
          >
            <Ionicons name="share-outline" size={iconSize.sm} color={headerAction.color} />
          </Pressable>
        }
      />

      <FormMessage message={actionError ?? error} />

      {partnersNow.length > 0 ? (
        <View className="mb-3 flex-row">
          <View className="flex-row items-center gap-2 rounded-full bg-cove-paper px-3 py-2">
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22C55E" }} />
            <AppText className="text-sm font-semibold text-cove-ink">
              {t("tripAlsoShopping", { name: partnersNow.join(", ") })}
            </AppText>
          </View>
        </View>
      ) : null}

      {askEnabled && (myAsk || tripItems.length > 0) ? (
        <AskHomeCard
          ask={myAsk}
          asking={isAsking}
          error={askError}
          onAsk={() => void askTheHome()}
        />
      ) : null}

      {showDock ? (
        // Holds the trip card's place in the list; the card itself floats above.
        <View
          collapsable={false}
          style={{ height: dockHeight, marginBottom: DOCK_GAP }}
          onLayout={(event) => {
            dockSlotY.value = event.nativeEvent.layout.y;
          }}
        />
      ) : null}

      {tipVisible && activeItems.length > 0 ? (
        <View className="mb-4 flex-row items-center gap-3 rounded-3xl bg-cove-mist px-4 py-3">
          <Ionicons name="hand-left-outline" size={18} color={colors.accentText} />
          <AppText className="min-w-0 flex-1 text-sm text-cove-ink">{t("tripHoldTip")}</AppText>
          <Pressable
            onPress={dismissTip}
            accessibilityRole="button"
            accessibilityLabel={t("close")}
            hitSlop={8}
            className="active:opacity-70"
          >
            <Ionicons name="close" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}

      {tripItems.length === 0 ? (
        <EmptyState title={t("tripEmpty")} message={t("tripEmptyBody")} />
      ) : (
        <View className="gap-6">
          {urgent.length > 0 ? (
            <TripGroup title={t("urgentSection")} items={urgent} {...rowProps} />
          ) : null}
          {groups.map((group) => (
            <TripGroup
              key={`${group.id}-${locale}`}
              title={group.title}
              items={group.items}
              {...rowProps}
            />
          ))}
          {notFoundItems.length > 0 ? (
            <TripGroup title={t("notFoundSection")} items={notFoundItems} {...rowProps} />
          ) : null}
        </View>
      )}

      <BottomSheet visible={holdItem !== null} onClose={() => setHoldItem(null)}>
        {holdItem ? (
          <View className="gap-3">
            <AppText className="text-xl font-semibold text-cove-ink" numberOfLines={2}>
              {holdItem.name}
            </AppText>
            <HoldOption
              icon={holdItem.notFoundAt ? "arrow-undo-outline" : "search-outline"}
              label={holdItem.notFoundAt ? t("notFoundPutBack") : t("notFoundHere")}
              onPress={() => void toggleNotFound(holdItem)}
            />
            <HoldOption
              icon="checkmark-circle-outline"
              label={t("boughtIt")}
              onPress={() => buyFromHold(holdItem)}
            />
          </View>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={nameOpen} locked={isSavingName} onClose={skipName}>
        <View className="gap-4">
          <AppText className="text-xl font-semibold text-cove-ink">{t("renameTrip")}</AppText>
          <AppText className="text-sm text-cove-muted">{t("renameTripBody")}</AppText>
          <SheetField
            value={tripName}
            onChangeText={setTripName}
            placeholder={t("tripNamePlaceholder")}
            icon="storefront-outline"
            maxLength={80}
            autoFocus
            onSubmitEditing={() => void saveNameAndExit()}
          />
          {shopChoices.length > 0 ? (
            <View className="gap-2">
              <AppText className="text-sm text-cove-muted">{t("savedShopNames")}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {shopChoices.map((name) => (
                  <Pressable
                    key={name}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setTripName(name);
                    }}
                    disabled={isSavingName}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    className="rounded-full border border-cove-line bg-cove-mist px-4 py-2 active:opacity-80"
                  >
                    <AppText className="text-sm font-semibold text-cove-ink">{name}</AppText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <FormMessage message={nameError} />
          <AppButton
            label={tripName.trim() ? t("saveChanges") : t("skipTripName")}
            variant={tripName.trim() ? "primary" : "secondary"}
            loading={isSavingName}
            disabled={isSavingName}
            onPress={() => void saveNameAndExit()}
          />
        </View>
      </BottomSheet>

      <BottomSheet visible={summaryOpen} onClose={closeSummary}>
        {summary ? (
          <TripSummaryCard
            summary={summary}
            total={costsEnabled && summary.priced > 0 ? formatMoney(summary.total, currency) : null}
            onDone={closeSummary}
            onShare={() => void shareSummary()}
          />
        ) : null}
      </BottomSheet>

      <ConfirmModal
        visible={leaveAskOpen}
        title={t("tripLeavePricesTitle")}
        message={t("tripLeavePricesBody", { count: openPending.length })}
        confirmLabel={t("tripLeaveAnyway")}
        cancelLabel={t("tripEnterPrices")}
        icon="pricetag-outline"
        error={leaveError}
        loading={isKeepingPrices}
        onConfirm={() => void leaveWithPending()}
        onCancel={enterPrices}
      />

      <CostEntrySheet
        visible={tripCostOpen}
        title={tripTotalMode ? t("tripTotalTitle") : t("tripCostsTitle")}
        subtitle={
          tripTotalMode
            ? `${t("tripTotalSubtitle")}\n${t("tripTotalItems", {
                count: (frozenTotalIds ?? sessionBoughtIds).length,
              })}`
            : t("tripCostsSubtitle")
        }
        currency={household?.currency ?? "JOD"}
        items={tripTotalMode ? tripTotalItems : tripCostItems}
        loading={isSavingCosts}
        scanning={scanning}
        covered={receiptCover || scanning}
        // Receipt scan matches lines to items — not useful for a single total.
        onScan={Platform.OS === "web" || tripTotalMode ? undefined : chooseReceiptPhoto}
        receipt={tripTotalMode ? null : receiptScan}
        errorMessage={actionError}
        skipLabel={t("skipCostsForNow")}
        onConfirm={(entries) =>
          void (tripTotalMode
            ? saveTripTotalAndExit(entries[0]?.cost ?? null)
            : saveTripCosts(entries))
        }
        onSkip={closeTripCosts}
        onClose={() => {
          if (isSavingCosts || scanning) return;
          closeTripCosts();
        }}
      />

      <ReceiptSourceModal
        visible={receiptSourceOpen || scanPhase === "reading"}
        reading={scanPhase === "reading"}
        onCamera={() => startReceiptScan("camera")}
        onLibrary={() => startReceiptScan("library")}
        onClose={closeReceiptSource}
      />
    </Screen>
  );
}

type RowActions = {
  /** Bought rows travel to the trip card, where their price is asked. */
  docks: boolean;
  onFly: (item: Purchase, from: Rect) => void;
  onCheck: (id: string, cost: number | null) => Promise<boolean>;
  onInflight: (delta: number) => void;
  onHold: (item: Purchase) => void;
  /** Lets the hold sheet's "Bought it" play the row's own check. */
  registerBuyer: (id: string, buy: (() => void) | null) => void;
  priceLabel: (item: Purchase) => string | null;
  /** "Sara just added", for items that arrived after the shopper asked the home. */
  addedNote: (item: Purchase) => string | null;
  userId: string | null;
};

function TripGroup({
  title,
  items,
  ...actions
}: RowActions & {
  title: string;
  items: Purchase[];
}) {
  return (
    <View>
      <SectionHeader title={title} meta={String(items.length)} />
      <View>
        {items.map((item, index) => (
          <TripCheckRow
            key={item.id}
            item={item}
            gap={index < items.length - 1 ? ROW_GAP : 0}
            docks={actions.docks}
            onFly={(from) => actions.onFly(item, from)}
            onCheck={() => actions.onCheck(item.id, null)}
            onInflight={actions.onInflight}
            onHold={() => actions.onHold(item)}
            registerBuyer={actions.registerBuyer}
            priceLabel={actions.priceLabel(item)}
            addedNote={actions.addedNote(item)}
            notFoundLabel={
              item.notFoundAt
                ? item.notFoundById && item.notFoundById === actions.userId
                  ? "you"
                  : (item.notFoundByName ?? "")
                : null
            }
          />
        ))}
      </View>
    </View>
  );
}

function TripCheckRow({
  item,
  gap,
  docks,
  onFly,
  onCheck,
  onInflight,
  onHold,
  registerBuyer,
  priceLabel,
  addedNote,
  notFoundLabel,
}: {
  item: Purchase;
  gap: number;
  docks: boolean;
  onFly: (from: Rect) => void;
  onCheck: () => Promise<boolean>;
  onInflight: (delta: number) => void;
  onHold: () => void;
  registerBuyer: (id: string, buy: (() => void) | null) => void;
  /** "last time JD 1.200", when known. */
  priceLabel: string | null;
  /** "Sara just added": it arrived after the shopper asked the home. */
  addedNote: string | null;
  /** Not found: "you", a name, or "" (unknown). Null when it was found. */
  notFoundLabel: string | null;
}) {
  const { colors, scheme } = useTheme();
  const { t, isRTL } = useI18n();
  const quantity = item.unit ? `${item.quantity} ${item.unit}` : `x${item.quantity}`;
  const notFoundColor = scheme === "dark" ? "#F5B454" : "#B45309";
  const notFoundText =
    notFoundLabel === null
      ? null
      : notFoundLabel === "you"
        ? t("notFoundByYou")
        : t("notFoundBy", { name: firstName(notFoundLabel) || t("partner") });
  const photoUri = itemPhotoUri(item);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const locked = useRef(false);
  const cardRef = useRef<ViewHandle>(null);
  const mounted = useRef(true);
  const held = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const contentHeight = useSharedValue(0);
  const check = useSharedValue(0);
  const ripple = useSharedValue(0);
  const leave = useSharedValue(0);
  // Flying to the trip card: a copy travels, so the row itself goes at once.
  const flown = useSharedValue(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!held.current) return;
      held.current = false;
      onInflight(-1);
    };
  }, [onInflight]);

  function onContentLayout(event: LayoutChangeEvent) {
    if (locked.current) return;
    const next = event.nativeEvent.layout.height;
    if (next > 0) contentHeight.value = next;
  }

  function unlock() {
    locked.current = false;
    setLeaving(false);
  }

  function restore() {
    flown.value = 0;
    check.value = withTiming(0, { duration: 180 });
    ripple.value = withTiming(0, { duration: 160 });
    leave.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) }, (finished) => {
      if (finished) runOnJS(unlock)();
    });
  }

  function releaseInflight() {
    if (!held.current) return;
    held.current = false;
    onInflight(-1);
  }

  function commit() {
    void onCheck().then((ok) => {
      releaseInflight();
      if (!ok && mounted.current) restore();
    });
  }

  function startExit() {
    locked.current = true;
    setLeaving(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (docks) {
      const card = cardRef.current;
      const close = () => {
        flown.value = 1;
        leave.value = withTiming(
          1,
          { duration: LEAVE_MS, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) runOnJS(commit)();
          },
        );
      };
      if (!card) {
        close();
        return;
      }
      card.measureInWindow((x, y, width, height) => {
        onFly({ x, y, width, height });
        close();
      });
      return;
    }
    check.value = withSpring(1, { damping: 13, stiffness: 340, mass: 0.45 });
    ripple.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    leave.value = withDelay(
      LEAVE_DELAY,
      withTiming(1, { duration: LEAVE_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(commit)();
      }),
    );
  }

  function playExit() {
    if (locked.current || held.current) return;
    held.current = true;
    onInflight(1);
    startExit();
  }

  const playExitRef = useRef(playExit);
  useLayoutEffect(() => {
    playExitRef.current = playExit;
  });
  useEffect(() => {
    registerBuyer(item.id, () => playExitRef.current());
    return () => registerBuyer(item.id, null);
  }, [item.id, registerBuyer]);

  const shellStyle = useAnimatedStyle(() => {
    const close = interpolate(leave.value, [0.45, 1], [0, 1], Extrapolation.CLAMP);
    const measured = contentHeight.value;
    return {
      height: measured > 0 ? measured * (1 - close) : undefined,
      marginBottom: gap * (1 - close),
    };
  });

  const motionStyle = useAnimatedStyle(() => ({
    opacity: flown.value ? 0 : interpolate(leave.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
    transformOrigin: isRTL ? "right center" : "left center",
    transform: [{ scale: interpolate(leave.value, [0, 0.5], [1, 0.9], Extrapolation.CLAMP) }],
  }));

  const fillStyle = useAnimatedStyle(() => {
    const t = Math.min(Math.max(check.value, 0), 1.1);
    return {
      opacity: Math.min(Math.max(check.value, 0), 1),
      transform: [{ scale: t }],
    };
  });

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(check.value, [0, 0.55], [1, 0], Extrapolation.CLAMP),
  }));

  const markStyle = useAnimatedStyle(() => {
    const t = interpolate(check.value, [0.3, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: t,
      transform: [{ scale: 0.5 + 0.5 * t }],
    };
  });

  const rippleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ripple.value, [0, 0.12, 1], [0, 0.5, 0], Extrapolation.CLAMP),
    transform: [{ scale: interpolate(ripple.value, [0, 1], [0.85, 3.8], Extrapolation.CLAMP) }],
  }));

  return (
    <Animated.View
      style={[{ overflow: "hidden" }, shellStyle]}
      pointerEvents={leaving ? "none" : "auto"}
    >
      <Animated.View style={motionStyle}>
        <View onLayout={onContentLayout} collapsable={false}>
          <Pressable
            onPress={playExit}
            onLongPress={onHold}
            delayLongPress={400}
            disabled={leaving}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: leaving }}
            accessibilityHint={t("tripSubtitle")}
            accessibilityActions={[{ name: "longpress", label: t("notFoundHere") }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === "longpress") onHold();
            }}
          >
            <View
              ref={cardRef}
              collapsable={false}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                overflow: "hidden",
                borderRadius: 24,
                paddingHorizontal: 16,
                paddingVertical: 16,
                backgroundColor: colors.paper,
              }}
            >
              <View
                style={{
                  width: CHECK_SIZE,
                  height: CHECK_SIZE,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: CHECK_SIZE,
                      height: CHECK_SIZE,
                      borderRadius: CHECK_SIZE / 2,
                      borderWidth: 2,
                      borderColor: colors.accentText,
                    },
                    rippleStyle,
                  ]}
                />
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: CHECK_SIZE,
                      height: CHECK_SIZE,
                      borderRadius: CHECK_SIZE / 2,
                      backgroundColor: colors.accent,
                    },
                    fillStyle,
                  ]}
                />
                <Animated.View style={ringStyle}>
                  <Ionicons name="ellipse-outline" size={CHECK_SIZE} color={colors.accentText} />
                </Animated.View>
                <Animated.View
                  style={[
                    {
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                    markStyle,
                  ]}
                >
                  <Ionicons name="checkmark" size={17} color={colors.onAccent} />
                </Animated.View>
              </View>
              <View className="min-w-0 flex-1" style={notFoundText ? { opacity: 0.8 } : undefined}>
                <AppText className="text-base font-semibold text-cove-ink">{item.name}</AppText>
                {item.notes ? (
                  <AppText className="mt-1 text-sm text-cove-muted">{item.notes}</AppText>
                ) : null}
                <AppText className="mt-1 text-sm text-cove-muted">
                  {priceLabel ? `${quantity} · ${priceLabel}` : quantity}
                </AppText>
                {addedNote ? (
                  <View
                    className="mt-1.5 self-start rounded-full px-2.5 py-0.5"
                    style={{
                      backgroundColor:
                        scheme === "dark" ? "rgba(110,231,168,0.16)" : "#BBF7D0",
                    }}
                  >
                    <AppText
                      className="text-xs font-semibold"
                      style={{ color: scheme === "dark" ? "#6EE7A8" : "#166534" }}
                    >
                      {addedNote}
                    </AppText>
                  </View>
                ) : null}
                {notFoundText ? (
                  <View className="mt-1 flex-row items-center gap-1">
                    <Ionicons name="search-outline" size={13} color={notFoundColor} />
                    <AppText className="text-sm font-semibold" style={{ color: notFoundColor }}>
                      {notFoundText}
                    </AppText>
                  </View>
                ) : null}
              </View>
              {photoUri ? (
                // Its own press target: look at the photo without checking the item off.
                <Pressable
                  onPress={() => setViewingPhoto(true)}
                  disabled={leaving}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={t("itemPhotoView")}
                  hitSlop={6}
                  className="active:opacity-80"
                >
                  <ItemPhotoThumb uri={photoUri} size={52} radius={14} />
                </Pressable>
              ) : null}
            </View>
          </Pressable>
        </View>
      </Animated.View>
      <ItemPhotoViewer
        uri={viewingPhoto ? photoUri : null}
        title={item.name}
        onClose={() => setViewingPhoto(false)}
      />
    </Animated.View>
  );
}

function HoldOption({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-row items-center gap-3 rounded-2xl bg-cove-mist px-4 py-4 active:opacity-80"
    >
      <Ionicons name={icon} size={iconSize.sm} color={colors.accentText} />
      <AppText className="text-base font-semibold text-cove-ink">{label}</AppText>
    </Pressable>
  );
}

function TripSummaryCard({
  summary,
  total,
  onDone,
  onShare,
}: {
  summary: TripSummary;
  total: string | null;
  onDone: () => void;
  onShare: () => void;
}) {
  const { t } = useI18n();
  const time = formatTripMinutes(summary.minutes, {
    minutes: (minutes) => t("tripMinutes", { minutes }),
    hours: (hours, minutes) => t("tripHoursMinutes", { hours, minutes }),
  });
  const subtitle = [
    summary.shopName,
    summary.partners.length > 0 ? t("tripSummaryWith", { names: summary.partners.join(", ") }) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const stats: { label: string; value: string }[] = [
    { label: t("tripSummaryBought"), value: String(summary.bought) },
    { label: t("tripSummaryLeft"), value: String(summary.left) },
    ...(total ? [{ label: t("tripSummaryTotal"), value: total }] : []),
    { label: t("tripSummaryTime"), value: time },
  ];
  return (
    <View className="gap-4">
      <View>
        <AppText className="text-xl font-semibold text-cove-ink">{t("tripSummaryTitle")}</AppText>
        {subtitle ? <AppText className="mt-1 text-sm text-cove-muted">{subtitle}</AppText> : null}
      </View>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        {stats.map((stat) => (
          <View
            key={stat.label}
            className="rounded-2xl bg-cove-mist px-4 py-3"
            style={{ flexBasis: "47%", flexGrow: 1 }}
          >
            <AppText className="text-lg font-semibold text-cove-ink">{stat.value}</AppText>
            <AppText className="text-sm text-cove-muted">{stat.label}</AppText>
          </View>
        ))}
      </View>
      {summary.notFound.length > 0 ? (
        <AppText className="text-sm text-cove-muted">
          {t("tripSummaryNotFound", { names: summary.notFound.join(", ") })}
        </AppText>
      ) : null}
      <AppButton label={t("tripSummaryDone")} onPress={onDone} />
      <AppButton
        label={t("tripSummaryShare")}
        variant="secondary"
        icon="share-outline"
        onPress={onShare}
      />
    </View>
  );
}

/** Floating snackbar: overlays the list instead of pushing it down. */
function UndoToast({ name, onUndo }: { name: string; onUndo: () => void }) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const motionOff = useMotionOff();
  const dark = scheme === "dark";
  const surface = dark ? colors.overlay : colors.ink;
  const text = dark ? colors.ink : colors.paper;
  // In light mode the bar is dark blue, so the accent blue would vanish on it.
  const action = dark ? colors.accentText : colors.paper;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 16, zIndex: 40 }}
    >
      <Animated.View
        entering={motionOff ? undefined : FadeInDown.duration(220)}
        exiting={motionOff ? undefined : FadeOutDown.duration(180)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 10,
          paddingStart: 16,
          paddingEnd: 8,
          borderRadius: 18,
          backgroundColor: surface,
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 8,
        }}
      >
        <Ionicons name="checkmark-circle" size={20} color={action} />
        <AppText numberOfLines={1} className="min-w-0 flex-1 text-sm" style={{ color: text }}>
          {t("boughtToast", { name })}
        </AppText>
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel={t("undoBought")}
          hitSlop={8}
          className="flex-row items-center gap-1 rounded-xl px-3 py-2 active:opacity-70"
        >
          <Ionicons name="arrow-undo" size={15} color={action} />
          <AppText className="text-sm font-semibold" style={{ color: action }}>
            {t("undoBought")}
          </AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}
