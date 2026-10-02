import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, Pressable, View, type LayoutChangeEvent } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { RequireSession } from "@/components/auth/RequireSession";
import { CostEntrySheet } from "@/components/purchases/CostEntrySheet";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { getCategoryLabel } from "@/constants/categories";
import { useCategories } from "@/providers/CategoriesProvider";
import { iconSize } from "@/constants/theme";
import { useHousehold } from "@/hooks/useHousehold";
import { usePurchases } from "@/hooks/usePurchases";
import { listLabel } from "@/lib/lists";
import { canUndoBought, formatNeededShare, shareNeededText } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import type { Purchase } from "@/types/purchase";

const ROW_GAP = 12;
const CHECK_SIZE = iconSize.md;
const LEAVE_DELAY = 140;
const LEAVE_MS = 380;

export default function TripScreen() {
  return (
    <RequireSession requireHome>
      <TripBody />
    </RequireSession>
  );
}

function TripBody() {
  const { needed, bought, isLoading, error, markBought, undoBought, updateCost } = usePurchases();
  const { household } = useHousehold();
  const { t, locale } = useI18n();
  const { categories } = useCategories();
  const { colors } = useTheme();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ listId?: string; listName?: string }>();
  const listId = typeof params.listId === "string" && params.listId.length > 0 ? params.listId : null;
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
  const [frozenTripCostItems, setFrozenTripCostItems] = useState<
    { id: string; name: string; initialCost?: number | null }[] | null
  >(null);
  const sessionNames = useRef(new Map<string, string>());
  const singleCostResolver = useRef<((value: number | null | undefined) => void) | null>(null);
  const inflightChecks = useRef(0);
  const allowLeaveRef = useRef(false);
  const tripCostOpenRef = useRef(false);
  const askTripCostsRef = useRef(false);

  const tripItems = useMemo(
    () => (listId ? needed.filter((item) => item.listId === listId) : needed),
    [listId, needed],
  );

  const recent = bought.find((item) => item.id === undoId && canUndoBought(item.boughtAt, now));
  const urgent = tripItems.filter((item) => item.urgent);
  const groups = categories
    .map((category) => ({
      id: category.id,
      title: category.builtin ? getCategoryLabel(category.id, locale) : (category.name ?? category.id),
      items: tripItems.filter((item) => !item.urgent && item.category === category.id),
    }))
    .filter((group) => group.items.length > 0);

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
      unpricedSessionIds.map((id) => ({
        id,
        name: sessionNames.current.get(id) ?? bought.find((item) => item.id === id)?.name ?? id,
        initialCost: bought.find((item) => item.id === id)?.cost,
      })),
    [bought, unpricedSessionIds],
  );

  const tripCostItems = frozenTripCostItems ?? liveTripCostItems;

  const askTripCosts =
    household?.costsEnabled === true &&
    household.askCostOnTripEnd !== false &&
    unpricedSessionIds.length > 0;

  useEffect(() => {
    tripCostOpenRef.current = tripCostOpen;
  }, [tripCostOpen]);

  useEffect(() => {
    askTripCostsRef.current = askTripCosts;
  }, [askTripCosts]);

  useEffect(() => {
    if (!undoId) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [undoId]);

  function exitTrip() {
    allowLeaveRef.current = true;
    router.back();
  }

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

  function noteInflight(delta: number) {
    inflightChecks.current = Math.max(0, inflightChecks.current + delta);
  }

  async function checkOff(id: string, cost: number | null = null) {
    setActionError(null);
    const item = tripItems.find((row) => row.id === id);
    if (item) sessionNames.current.set(id, item.name);
    const result = await markBought(id, cost);
    if (result.error) {
      setActionError(result.error);
      return false;
    }
    setSessionBoughtIds((current) => (current.includes(id) ? current : [...current, id]));
    setUndoId(id);
    setNow(Date.now());
    return true;
  }

  async function undoLast() {
    if (!recent) return;
    setActionError(null);
    const result = await undoBought(recent.id);
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

  function leaveTrip() {
    if (isSavingCosts) return;
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
      setTripCostOpen(true);
      return;
    }
    exitTrip();
  }

  const leaveTripRef = useRef(leaveTrip);
  leaveTripRef.current = leaveTrip;

  useFocusEffect(
    useCallback(() => {
      const onHardwareBack = () => {
        leaveTripRef.current();
        return true;
      };
      const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
      return () => sub.remove();
    }, []),
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

  async function saveTripCosts(entries: { id: string; cost: number | null }[]) {
    setIsSavingCosts(true);
    setActionError(null);
    for (const entry of entries) {
      if (entry.cost === null) continue;
      const result = await updateCost(entry.id, entry.cost);
      if (result.error) {
        setIsSavingCosts(false);
        setActionError(result.error);
        return;
      }
    }
    setIsSavingCosts(false);
    setTripCostOpen(false);
    setFrozenTripCostItems(null);
    exitTrip();
  }

  if (isLoading && tripItems.length === 0 && bought.length === 0 && !error) {
    return <LoadingScreen />;
  }

  return (
    <Screen>
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
            className="h-11 w-11 items-center justify-center rounded-full bg-white active:opacity-80"
          >
            <Ionicons name="share-outline" size={iconSize.sm} color={colors.accent} />
          </Pressable>
        }
      />

      <FormMessage message={actionError ?? error} />

      {recent ? (
        <View className="mb-5 flex-row items-center justify-between gap-3 rounded-3xl bg-cove-paper px-4 py-3">
          <AppText className="min-w-0 flex-1 text-sm text-cove-ink">{t("markedBoughtUndo")}</AppText>
          <Pressable onPress={() => void undoLast()} className="active:opacity-80">
            <AppText className="text-sm font-semibold text-cove-accent">{t("undoBought")}</AppText>
          </Pressable>
        </View>
      ) : null}

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
        title={t("tripCostsTitle")}
        subtitle={t("tripCostsSubtitle")}
        currency={household?.currency ?? "JOD"}
        items={tripCostItems}
        loading={isSavingCosts}
        errorMessage={actionError}
        skipLabel={t("skipCostsForNow")}
        onConfirm={(entries) => void saveTripCosts(entries)}
        onSkip={() => {
          setTripCostOpen(false);
          setFrozenTripCostItems(null);
          exitTrip();
        }}
        onClose={() => {
          if (isSavingCosts) return;
          setTripCostOpen(false);
          setFrozenTripCostItems(null);
          exitTrip();
        }}
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
  const { isRTL } = useI18n();
  const quantity = item.unit ? `${item.quantity} ${item.unit}` : `x${item.quantity}`;
  const locked = useRef(false);
  const pendingCost = useRef<number | null>(null);
  const mounted = useRef(true);
  const [leaving, setLeaving] = useState(false);
  const contentHeight = useSharedValue(0);
  const check = useSharedValue(0);
  const ripple = useSharedValue(0);
  const leave = useSharedValue(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

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

  function finishInflight() {
    onInflight(-1);
  }

  function commit() {
    void onCheck(pendingCost.current).then((ok) => {
      finishInflight();
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
    if (locked.current) return;
    onInflight(1);
    const cost = await onAskCost();
    if (cost === undefined) {
      onInflight(-1);
      return;
    }
    pendingCost.current = cost;
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
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Animated.View>
  );
}
