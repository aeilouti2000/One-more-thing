import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState, BackHandler, Platform, Pressable, View, type LayoutChangeEvent } from "react-native";
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
import { CostEntrySheet } from "@/features/items/components/cost-entry-sheet";
import { ItemPhotoThumb, ItemPhotoViewer, itemPhotoUri } from "@/features/items/components/item-photo";
import { ReceiptSourceModal } from "@/features/items/components/receipt-source-modal";
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
  firstName,
  heartbeatShopLock,
  releaseShopLock,
  SHOP_LOCK_HEARTBEAT_MS,
} from "@/features/items/api/shop-locks";
import { canUndoBought, formatNeededShare, shareNeededText } from "@/features/items/utils/share-list";
import { pickReceiptPhoto, interpretReceiptPhoto, type ReceiptScan } from "@/features/items/utils/scan-receipt";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Purchase } from "@/features/items/types/purchase";

const ROW_GAP = 12;
const CHECK_SIZE = iconSize.md;
const LEAVE_DELAY = 140;
const LEAVE_MS = 380;
const TRIP_REFRESH_MS = 5000;

/** How long the floating Undo toast stays up after a check. */
const UNDO_TOAST_MS = 5000;
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
  } =
    usePurchases();
  const { household } = useHousehold();
  const { t, locale } = useI18n();
  const { categories } = useCategories();
  const { colors, scheme } = useTheme();
  const headerAction = headerActionStyle(scheme, colors);
  const navigation = useNavigation<NavigationProp<ParamListBase>>();
  const params = useLocalSearchParams<{ listId?: string; listName?: string; category?: string }>();
  const listId = typeof params.listId === "string" && params.listId.length > 0 ? params.listId : null;
  const category =
    typeof params.category === "string" && params.category.length > 0 ? params.category : null;
  const listName =
    typeof params.listName === "string" && params.listName.length > 0
      ? listLabel(params.listName, t("defaultList"))
      : null;
  const [actionError, setActionError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [sessionBoughtIds, setSessionBoughtIds] = useState<string[]>([]);
  const [tripCostOpen, setTripCostOpen] = useState(false);
  const [singleCostItem, setSingleCostItem] = useState<Purchase | null>(null);
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [scanPhase, setScanPhase] = useState<"picking" | "reading" | null>(null);
  const [receiptCover, setReceiptCover] = useState(false);
  const [receiptSourceOpen, setReceiptSourceOpen] = useState(false);
  const [receiptScan, setReceiptScan] = useState<ReceiptScan | null>(null);
  const [frozenTripCostItems, setFrozenTripCostItems] = useState<
    { id: string; name: string; quantity?: number; initialCost?: number | null }[] | null
  >(null);
  const [sessionNames, setSessionNames] = useState(() => new Map<string, string>());
  const singleCostResolver = useRef<((value: number | null | undefined) => void) | null>(null);
  const inflightChecks = useRef(0);
  const undoing = useRef(false);
  const allowLeaveRef = useRef(false);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tripCostOpenRef = useRef(false);
  const askTripCostsRef = useRef(false);

  const tripItems = useMemo(
    () =>
      needed.filter((item) => {
        if (listId && item.listId !== listId) return false;
        if (category && item.category !== category) return false;
        return true;
      }),
    [category, listId, needed],
  );

  const recent = bought.find((item) => item.id === undoId && canUndoBought(item.boughtAt, now));
  const urgent = useMemo(() => tripItems.filter((item) => item.urgent), [tripItems]);
  const groups = useMemo(
    () =>
      categories
        .map((entry) => ({
          id: entry.id,
          title: entry.builtin ? getCategoryLabel(entry.id, locale) : (entry.name ?? entry.id),
          items: tripItems.filter((item) => !item.urgent && item.category === entry.id),
        }))
        .filter((group) => group.items.length > 0),
    [categories, locale, tripItems],
  );

  const askCostOnCheck =
    household?.costsEnabled === true && household.askCostOnSingleBuy !== false;

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
    askTripCostsRef.current = askTripCosts;
  }, [askTripCosts]);

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
  const homeId = household?.id ?? null;
  const lockHeldRef = useRef(false);

  function exitTrip() {
    allowLeaveRef.current = true;
    if (lockHeldRef.current && homeId && listId) {
      lockHeldRef.current = false;
      void releaseShopLock(homeId, listId);
    }
    router.back();
  }

  useFocusEffect(
    useCallback(() => {
      if (!multiMemberHome || !homeId || !listId) return;

      let cancelled = false;
      lockHeldRef.current = false;

      void (async () => {
        const claimed = await claimShopLock(homeId, listId);
        if (cancelled) {
          if (claimed.lock?.isMine) void releaseShopLock(homeId, listId);
          return;
        }
        if (claimed.lock?.active && !claimed.lock.isMine) {
          setActionError(
            t("shopLockedToast", {
              name: firstName(claimed.lock.shopperName) || t("partner"),
            }),
          );
          allowLeaveRef.current = true;
          router.back();
          return;
        }
        if (claimed.lock?.isMine) {
          lockHeldRef.current = true;
          return;
        }
        // Network hiccup: keep shopping and retry on the next heartbeat tick.
        lockHeldRef.current = true;
      })();

      const timer = setInterval(() => {
        if (AppState.currentState !== "active") return;
        if (!lockHeldRef.current) return;
        void heartbeatShopLock(homeId, listId).then(async (result) => {
          if (result.lock?.isMine) return;
          const retry = await claimShopLock(homeId, listId);
          if (retry.lock?.isMine) return;
          if (retry.lock?.active && !retry.lock.isMine) {
            lockHeldRef.current = false;
            setActionError(
              t("shopLockedToast", {
                name: firstName(retry.lock.shopperName) || t("partner"),
              }),
            );
            allowLeaveRef.current = true;
            router.back();
          }
        });
      }, SHOP_LOCK_HEARTBEAT_MS);

      return () => {
        cancelled = true;
        clearInterval(timer);
        if (lockHeldRef.current) {
          lockHeldRef.current = false;
          void releaseShopLock(homeId, listId);
        }
      };
    }, [homeId, listId, multiMemberHome, t]),
  );

  async function askCostForItem(item: Purchase): Promise<number | null | undefined> {
    if (!askCostOnCheck) return null;
    // Avoid overlapping prompts (would orphan the first check's promise).
    if (singleCostResolver.current || tripCostOpen) return undefined;
    return new Promise((resolve) => {
      singleCostResolver.current = resolve;
      setSingleCostItem(item);
    });
  }

  function resolveSingleCost(value: number | null | undefined) {
    const resolve = singleCostResolver.current;
    singleCostResolver.current = null;
    setSingleCostItem(null);
    resolve?.(value);
  }

  const singleCostSheetItems = useMemo(
    () =>
      singleCostItem
        ? [{ id: singleCostItem.id, name: singleCostItem.name }]
        : [],
    [singleCostItem],
  );

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
    const result = await markBought(id, cost);
    if (result.error) {
      setActionError(result.error);
      return false;
    }
    setSessionBoughtIds((current) => (current.includes(id) ? current : [...current, id]));
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
    const result = await undoBought(recent.id);
    undoing.current = false;
    if (result.error) {
      setActionError(result.error);
      return;
    }
    setSessionBoughtIds((current) => current.filter((id) => id !== recent.id));
    setUndoId(null);
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

  function leaveTrip() {
    if (isSavingCosts || scanning || receiptCover) return;
    if (singleCostResolver.current) {
      resolveSingleCost(undefined);
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
      }, TRIP_REFRESH_MS);
      return () => {
        sub.remove();
        clearInterval(timer);
      };
    }, [refresh]),
  );

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (event) => {
      if (allowLeaveRef.current) return;
      if (
        inflightChecks.current > 0 ||
        singleCostResolver.current ||
        tripCostOpenRef.current ||
        askTripCostsRef.current
      ) {
        event.preventDefault();
        leaveTripRef.current();
      }
    });
    return unsub;
  }, [navigation]);

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
      // Wait out a check still animating / saving, or a cost prompt.
      if (inflightChecks.current > 0 || singleCostResolver.current) {
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

  return (
    <Screen
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

      {tripItems.length === 0 ? (
        <EmptyState title={t("tripEmpty")} message={t("tripEmptyBody")} />
      ) : (
        <View className="gap-6">
          {urgent.length > 0 ? (
            <TripGroup
              title={t("urgentSection")}
              items={urgent}
              onAskCost={askCostForItem}
              onCheck={checkOff}
              onInflight={noteInflight}
            />
          ) : null}
          {groups.map((group) => (
            <TripGroup
              key={`${group.id}-${locale}`}
              title={group.title}
              items={group.items}
              onAskCost={askCostForItem}
              onCheck={checkOff}
              onInflight={noteInflight}
            />
          ))}
        </View>
      )}

      <CostEntrySheet
        visible={singleCostItem !== null}
        title={t("enterCost")}
        subtitle={singleCostItem?.name}
        currency={household?.currency ?? "JOD"}
        items={singleCostSheetItems}
        skipLabel={t("skipCost")}
        onConfirm={(entries) => resolveSingleCost(entries[0]?.cost ?? null)}
        onSkip={() => resolveSingleCost(null)}
        onClose={() => resolveSingleCost(undefined)}
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

function TripGroup({
  title,
  items,
  onAskCost,
  onCheck,
  onInflight,
}: {
  title: string;
  items: Purchase[];
  onAskCost: (item: Purchase) => Promise<number | null | undefined>;
  onCheck: (id: string, cost: number | null) => Promise<boolean>;
  onInflight: (delta: number) => void;
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
            onAskCost={() => onAskCost(item)}
            onCheck={(cost) => onCheck(item.id, cost)}
            onInflight={onInflight}
          />
        ))}
      </View>
    </View>
  );
}

function TripCheckRow({
  item,
  gap,
  onAskCost,
  onCheck,
  onInflight,
}: {
  item: Purchase;
  gap: number;
  onAskCost: () => Promise<number | null | undefined>;
  onCheck: (cost: number | null) => Promise<boolean>;
  onInflight: (delta: number) => void;
}) {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const quantity = item.unit ? `${item.quantity} ${item.unit}` : `x${item.quantity}`;
  const photoUri = itemPhotoUri(item);
  const [viewingPhoto, setViewingPhoto] = useState(false);
  const locked = useRef(false);
  const pendingCost = useRef<number | null>(null);
  const mounted = useRef(true);
  const held = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const contentHeight = useSharedValue(0);
  const check = useSharedValue(0);
  const ripple = useSharedValue(0);
  const leave = useSharedValue(0);

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
    void onCheck(pendingCost.current).then((ok) => {
      releaseInflight();
      if (!ok && mounted.current) restore();
    });
  }

  function startExit() {
    locked.current = true;
    setLeaving(true);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    check.value = withSpring(1, { damping: 13, stiffness: 340, mass: 0.45 });
    ripple.value = withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) });
    leave.value = withDelay(
      LEAVE_DELAY,
      withTiming(1, { duration: LEAVE_MS, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(commit)();
      }),
    );
  }

  async function playExit() {
    if (locked.current || held.current) return;
    held.current = true;
    onInflight(1);
    const cost = await onAskCost();
    if (cost === undefined) {
      releaseInflight();
      return;
    }
    pendingCost.current = cost;
    if (!mounted.current) {
      void onCheck(cost);
      return;
    }
    startExit();
  }

  const shellStyle = useAnimatedStyle(() => {
    const close = interpolate(leave.value, [0.45, 1], [0, 1], Extrapolation.CLAMP);
    const measured = contentHeight.value;
    return {
      height: measured > 0 ? measured * (1 - close) : undefined,
      marginBottom: gap * (1 - close),
    };
  });

  const motionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(leave.value, [0, 0.5], [1, 0], Extrapolation.CLAMP),
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
            disabled={leaving}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: leaving }}
          >
            <View
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
                      borderColor: colors.accent,
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
                  <Ionicons name="ellipse-outline" size={CHECK_SIZE} color={colors.accent} />
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
              <View className="min-w-0 flex-1">
                <AppText className="text-base font-semibold text-cove-ink">{item.name}</AppText>
                {item.notes ? (
                  <AppText className="mt-1 text-sm text-cove-muted">{item.notes}</AppText>
                ) : null}
                <AppText className="mt-1 text-sm text-cove-muted">{quantity}</AppText>
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

/** Floating snackbar: overlays the list instead of pushing it down. */
function UndoToast({ name, onUndo }: { name: string; onUndo: () => void }) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dark = scheme === "dark";
  const surface = dark ? colors.paper : colors.ink;
  const text = dark ? colors.ink : colors.paper;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 16, zIndex: 40 }}
    >
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
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
        <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
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
          <Ionicons name="arrow-undo" size={15} color={colors.accent} />
          <AppText className="text-sm font-semibold" style={{ color: colors.accent }}>
            {t("undoBought")}
          </AppText>
        </Pressable>
      </Animated.View>
    </View>
  );
}
