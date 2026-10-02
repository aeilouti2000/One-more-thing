import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Dimensions, Modal, Pressable, ScrollView, View } from "react-native";
import { HistoryDateField } from "@/components/purchases/HistoryDateField";
import { ItemDetailCard } from "@/components/purchases/ItemDetailCard";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, GlassFill } from "@/components/ui/BlurBackdrop";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen, SwipeSlideContent } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { usePurchases } from "@/hooks/usePurchases";
import { useHousehold } from "@/hooks/useHousehold";
import { formatMoney, sumKnownCosts } from "@/lib/currency";
import { fetchHistoryLists, fetchLists, listLabel, type HistoryList, type HomeList } from "@/lib/lists";
import { canUndoBought } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { headerIconFrameStyle, iconSize } from "@/constants/theme";
import type { Purchase } from "@/types/purchase";

type HistoryRange = "all" | "today" | "week" | "month";
type HistoryMode = "list" | "invoice";
type Anchor = { x: number; y: number; width: number; height: number };

const HISTORY_RANGES: HistoryRange[] = ["all", "today", "week", "month"];

export default function HistoryScreen() {
  const { bought, isLoading, error, refresh, undoBought, addItem } = usePurchases();
  const { household } = useHousehold();
  const { t, locale, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [buyAgainId, setBuyAgainId] = useState<string | null>(null);
  const [buyAgainNotice, setBuyAgainNotice] = useState<string | null>(null);
  const [range, setRange] = useState<HistoryRange>("all");
  const [mode, setMode] = useState<HistoryMode>("list");
  const [activeLists, setActiveLists] = useState<HomeList[]>([]);
  const [historyLists, setHistoryLists] = useState<HistoryList[]>([]);
  const [listId, setListId] = useState<string>("all");
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [isChoosingList, setIsChoosingList] = useState(false);
  const [isChoosingRange, setIsChoosingRange] = useState(false);
  const [listAnchor, setListAnchor] = useState<Anchor | null>(null);
  const [rangeAnchor, setRangeAnchor] = useState<Anchor | null>(null);
  const listButtonRef = useRef<View>(null);
  const rangeButtonRef = useRef<View>(null);
  const [openItem, setOpenItem] = useState<Purchase | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const costsEnabled = household?.costsEnabled === true;
  const currency = household?.currency ?? "JOD";
  const hasUndo = bought.some((item) => canUndoBought(item.boughtAt, now));
  const filterLists = useMemo(() => {
    const byId = new Map<string, HistoryList>();
    for (const list of historyLists) {
      byId.set(list.id, list);
    }
    // Fallback: derived from bought purchases if the history-lists API is unavailable.
    const activeIds = new Set(activeLists.map((list) => list.id));
    for (const item of bought) {
      if (!item.listId || byId.has(item.listId)) continue;
      byId.set(item.listId, {
        id: item.listId,
        name: item.listName ?? "List",
        deleted: !activeIds.has(item.listId),
      });
    }
    return [...byId.values()].sort((a, b) => {
      if (a.deleted !== b.deleted) return a.deleted ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [historyLists, bought, activeLists]);
  const visible = bought.filter((item) => {
    const inList = listId === "all" || item.listId === listId;
    const inDate = pickedDate
      ? sameLocalDay(item.boughtAt, pickedDate)
      : boughtInRange(item.boughtAt, range, now);
    return inList && inDate;
  });

  useEffect(() => {
    if (!openItem) return;
    const next = bought.find((item) => item.id === openItem.id);
    setOpenItem(next ?? null);
  }, [bought, openItem?.id]);
  const spend = useMemo(
    () => sumKnownCosts(visible.map((item) => item.cost)),
    [visible],
  );
  const pickedLabel = pickedDate
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(pickedDate)
    : null;
  const rangeLabel: Record<HistoryRange, string> = {
    all: t("allTime"),
    today: t("historyToday"),
    week: t("historyWeek"),
    month: t("historyMonth"),
  };
  const periodTitle = pickedLabel ?? rangeLabel[range];

  useEffect(() => {
    if (!costsEnabled && mode === "invoice") setMode("list");
  }, [costsEnabled, mode]);

  useFocusEffect(
    useCallback(() => {
      if (!household) {
        setActiveLists([]);
        setHistoryLists([]);
        setListId("all");
        return;
      }
      void Promise.all([fetchLists(household.id), fetchHistoryLists(household.id)]).then(
        ([active, history]) => {
          setActiveLists(active.lists);
          setHistoryLists(history.lists);
        },
      );
    }, [household]),
  );

  useEffect(() => {
    setListId((current) =>
      current === "all" || filterLists.some((list) => list.id === current) ? current : "all",
    );
  }, [filterLists]);

  useEffect(() => {
    if (!hasUndo) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hasUndo]);

  useEffect(() => {
    if (!buyAgainNotice) return;
    const timer = setTimeout(() => setBuyAgainNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [buyAgainNotice]);

  const canSwipeMode = useCallback(
    (direction: "next" | "previous") => {
      if (!costsEnabled) return false;
      const toInvoice = direction === "next" ? !isRTL : isRTL;
      return toInvoice ? mode === "list" : mode === "invoice";
    },
    [costsEnabled, isRTL, mode],
  );

  const onSwipeMode = useCallback(
    (direction: "next" | "previous") => {
      if (!costsEnabled) return;
      const toInvoice = direction === "next" ? !isRTL : isRTL;
      setMode(toInvoice ? "invoice" : "list");
      void Haptics.selectionAsync();
    },
    [costsEnabled, isRTL],
  );

  async function undo(id: string) {
    setUndoId(id);
    setUndoError(null);
    const result = await undoBought(id);
    setUndoId(null);
    if (result.error) setUndoError(result.error);
  }

  async function buyAgain(purchase: Purchase) {
    setBuyAgainId(purchase.id);
    setUndoError(null);
    setBuyAgainNotice(null);
    const listStillActive =
      !!purchase.listId && activeLists.some((list) => list.id === purchase.listId);
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
      setUndoError(result.error);
      return;
    }
    setBuyAgainNotice(t("boughtAgain"));
  }

  function openAnchored(
    ref: RefObject<View | null>,
    setAnchor: (anchor: Anchor) => void,
    setOpen: (open: boolean) => void,
  ) {
    const node = ref.current;
    if (!node) {
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setOpen(true);
    });
  }

  async function onRefresh() {
    setIsRefreshing(true);
    await refresh();
    if (household) {
      const [active, history] = await Promise.all([
        fetchLists(household.id),
        fetchHistoryLists(household.id),
      ]);
      setActiveLists(active.lists);
      setHistoryLists(history.lists);
    } else {
      setActiveLists([]);
      setHistoryLists([]);
      setListId("all");
    }
    setIsRefreshing(false);
  }

  if (isLoading && bought.length === 0 && !error) {
    return <LoadingScreen />;
  }

  return (
    <Screen
      tabBarInset
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
      onSwipe={costsEnabled ? onSwipeMode : undefined}
      canSwipe={costsEnabled ? canSwipeMode : undefined}
    >
      <ScreenHeader
        title={mode === "invoice" ? t("invoiceTitle") : t("historyTitle")}
        subtitle={mode === "invoice" ? t("invoiceSubtitle") : t("historySubtitle")}
        icon={
          <View
            className="items-center justify-center"
            style={headerIconFrameStyle(scheme)}
          >
            <Ionicons
              name={mode === "invoice" ? "receipt-outline" : "time-outline"}
              size={34}
              color="#FFFFFF"
            />
          </View>
        }
        right={
          costsEnabled ? (
            <Pressable
              onPress={() => {
                setMode((current) => (current === "list" ? "invoice" : "list"));
                void Haptics.selectionAsync();
              }}
              accessibilityRole="button"
              accessibilityLabel={mode === "list" ? t("openInvoice") : t("backToHistoryList")}
              className="rounded-full bg-white px-3 py-2 active:opacity-80"
            >
              <AppText className="text-sm font-semibold" style={{ color: colors.accent }}>
                {mode === "list" ? t("openInvoice") : t("backToHistoryList")}
              </AppText>
            </Pressable>
          ) : null
        }
      />

      <SwipeSlideContent>
        {bought.length > 0 ? (
          <HistoryDateField
            value={pickedDate}
            onChange={(date) => setPickedDate(date)}
            leading={
              <>
                <View ref={listButtonRef} collapsable={false} className="min-w-0 flex-1">
                  <ChoiceButton
                    icon="list-outline"
                    selected={listId !== "all"}
                    label={
                      listId === "all"
                        ? t("allLists")
                        : historyListLabel(
                            filterLists.find((list) => list.id === listId),
                            t("defaultList"),
                            t("deletedList"),
                          )
                    }
                    onPress={() => openAnchored(listButtonRef, setListAnchor, setIsChoosingList)}
                  />
                </View>
                <View ref={rangeButtonRef} collapsable={false} className="min-w-0 flex-1">
                  <ChoiceButton
                    icon="time-outline"
                    selected={pickedDate !== null || range !== "all"}
                    label={pickedLabel ?? rangeLabel[range]}
                    onPress={() => openAnchored(rangeButtonRef, setRangeAnchor, setIsChoosingRange)}
                  />
                </View>
              </>
            }
          />
        ) : null}

        {costsEnabled && visible.length > 0 ? (
          <View className="mb-4 rounded-3xl bg-cove-paper px-4 py-3">
            <AppText className="text-sm font-semibold text-cove-ink">
              {t("costSummary", {
                priced: spend.priced,
                count: spend.count,
                total: formatMoney(spend.total, currency),
              })}
            </AppText>
            <AppText className="mt-1 text-xs text-cove-muted">{periodTitle}</AppText>
          </View>
        ) : null}

        <FormMessage message={undoError ?? error} />
        <FormMessage message={buyAgainNotice} tone="success" />

        {bought.length === 0 ? (
          <EmptyState
            title={t("noPurchases")}
            message={t("noPurchasesBody")}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title={pickedLabel ? t("historyNoDateData") : t("historyFilterEmpty")}
            message={
              pickedLabel
                ? t("historyNoDateDataBody", { date: pickedLabel })
                : t("historyFilterEmptyBody")
            }
          />
        ) : mode === "invoice" ? (
          <InvoiceView
            items={visible}
            currency={currency}
            periodTitle={periodTitle}
            locale={locale}
            total={spend.total}
            priced={spend.priced}
            count={spend.count}
            onPressItem={setOpenItem}
          />
        ) : (
          <View className="gap-3">
            {visible.map((purchase) => (
              <PurchaseRow
                key={purchase.id}
                purchase={purchase}
                onPress={() => setOpenItem(purchase)}
                onUndo={
                  canUndoBought(purchase.boughtAt, now) && undoId !== purchase.id
                    ? () => void undo(purchase.id)
                    : undefined
                }
                onBuyAgain={
                  buyAgainId === purchase.id ? undefined : () => void buyAgain(purchase)
                }
              />
            ))}
          </View>
        )}
      </SwipeSlideContent>

      <ItemDetailCard
        purchase={openItem}
        visible={openItem !== null}
        onClose={() => setOpenItem(null)}
      />

      <OptionMenu
        visible={isChoosingList}
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
        onSelect={(id) => setListId(id)}
        onClose={() => setIsChoosingList(false)}
      />
      <OptionMenu
        visible={isChoosingRange}
        anchor={rangeAnchor}
        isRTL={isRTL}
        options={HISTORY_RANGES.map((item) => ({ id: item, label: rangeLabel[item] }))}
        selectedId={pickedDate ? "" : range}
        onSelect={(id) => {
          setPickedDate(null);
          setRange(id as HistoryRange);
        }}
        onClose={() => setIsChoosingRange(false)}
      />
    </Screen>
  );
}

function InvoiceView({
  items,
  currency,
  periodTitle,
  locale,
  total,
  priced,
  count,
  onPressItem,
}: {
  items: Purchase[];
  currency: string;
  periodTitle: string;
  locale: string;
  total: number;
  priced: number;
  count: number;
  onPressItem: (item: Purchase) => void;
}) {
  const { t } = useI18n();
  const { colors, scheme } = useTheme();

  if (items.length === 0) {
    return (
      <EmptyState title={t("invoiceEmpty")} message={t("invoiceEmptyBody")} />
    );
  }

  return (
    <View
      className="overflow-hidden rounded-3xl border border-cove-line px-4 py-4"
      style={{ backgroundColor: scheme === "dark" ? colors.paper : colors.paper }}
    >
      <AppText className="text-lg font-semibold text-cove-ink">{periodTitle}</AppText>
      <AppText className="mt-1 text-sm text-cove-muted">
        {t("costSummary", {
          priced,
          count,
          total: formatMoney(total, currency),
        })}
      </AppText>

      <View className="mt-4 gap-0">
        {items.map((item, index) => {
          const when = item.boughtAt
            ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
                month: "short",
                day: "numeric",
              }).format(new Date(item.boughtAt))
            : "";
          const qty = item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity);
          return (
            <Pressable
              key={item.id}
              onPress={() => onPressItem(item)}
              className="flex-row items-start justify-between gap-3 py-3 active:opacity-80"
              style={
                index < items.length - 1
                  ? { borderBottomWidth: 1, borderBottomColor: colors.line }
                  : undefined
              }
            >
              <View className="min-w-0 flex-1">
                <AppText className="text-base font-semibold text-cove-ink" numberOfLines={2}>
                  {item.name}
                </AppText>
                <AppText className="mt-1 text-xs text-cove-muted">
                  {qty}
                  {item.boughtByName ? ` · ${item.boughtByName}` : ""}
                  {when ? ` · ${when}` : ""}
                </AppText>
              </View>
              <AppText className="text-base font-semibold text-cove-ink">
                {formatMoney(item.cost, currency, t("noPrice"))}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View className="mt-4 flex-row items-center justify-between border-t border-cove-line pt-4">
        <AppText className="text-base font-semibold text-cove-ink">{t("itemCost")}</AppText>
        <AppText className="text-lg font-semibold text-cove-accent">
          {formatMoney(total, currency)}
        </AppText>
      </View>
    </View>
  );
}

function ChoiceButton({
  icon,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="h-10 w-full min-w-0 flex-row items-center justify-center gap-1.5 rounded-full px-2.5 active:opacity-80"
      style={{
        backgroundColor: selected ? colors.accent : colors.paper,
        borderWidth: 1,
        borderColor: selected ? colors.accent : colors.line,
      }}
    >
      <Ionicons name={icon} size={15} color={selected ? colors.white : colors.accent} />
      <AppText
        numberOfLines={1}
        className="shrink text-xs font-semibold"
        style={{ color: selected ? colors.white : colors.ink }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function OptionMenu({
  visible,
  anchor,
  isRTL,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  anchor: Anchor | null;
  isRTL: boolean;
  options: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { colors, shadow } = useTheme();
  const frame = menuFrame(anchor, isRTL);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1">
        <BlurBackdrop onPress={onClose} />
        <View
          className="absolute"
          style={{
            top: frame.top,
            left: frame.left,
            width: frame.width,
            borderRadius: 24,
            shadowColor: shadow.color,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.16,
            shadowRadius: 16,
            elevation: 8,
          }}
        >
          <View
            className="overflow-hidden rounded-3xl border border-cove-line"
            style={{ maxHeight: frame.maxHeight }}
          >
            <GlassFill soft />
            <ScrollView
              bounces={false}
              style={{ flexGrow: 0, maxHeight: frame.maxHeight }}
              contentContainerStyle={{ gap: 4, padding: 8 }}
            >
            {options.map((option) => {
              const selected = option.id === selectedId;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => {
                    onSelect(option.id);
                    onClose();
                  }}
                  className="flex-row items-center justify-between rounded-2xl px-3 py-3 active:opacity-80"
                  style={{ backgroundColor: selected ? colors.accent : "transparent" }}
                >
                  <AppText
                    numberOfLines={1}
                    className="min-w-0 flex-1 text-sm font-medium"
                    style={{ color: selected ? colors.white : colors.ink }}
                  >
                    {option.label}
                  </AppText>
                  {selected ? (
                    <Ionicons name="checkmark" size={iconSize.sm} color={colors.white} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function historyListLabel(
  list: { name: string; deleted: boolean } | undefined,
  defaultLabel: string,
  deletedLabel: string,
) {
  const name = listLabel(list?.name ?? "", defaultLabel);
  return list?.deleted ? `${name} (${deletedLabel})` : name;
}

function menuFrame(anchor: Anchor | null, isRTL: boolean) {
  const screen = Dimensions.get("window");
  const width = Math.min(240, screen.width - 32);
  const gap = 8;
  const top = anchor ? anchor.y + anchor.height + gap : 96;
  const start = anchor ? (isRTL ? anchor.x + anchor.width - width : anchor.x) : 16;
  return {
    top,
    left: Math.max(16, Math.min(start, screen.width - width - 16)),
    width,
    maxHeight: Math.max(180, screen.height - top - 16),
  };
}

function sameLocalDay(boughtAt: string | undefined, day: Date) {
  if (!boughtAt) return false;
  const bought = new Date(boughtAt);
  if (Number.isNaN(bought.getTime())) return false;
  return (
    bought.getFullYear() === day.getFullYear() &&
    bought.getMonth() === day.getMonth() &&
    bought.getDate() === day.getDate()
  );
}

function boughtInRange(boughtAt: string | undefined, range: HistoryRange, nowMs: number) {
  if (range === "all") return true;
  if (!boughtAt) return false;
  const bought = new Date(boughtAt);
  if (Number.isNaN(bought.getTime())) return false;
  const now = new Date(nowMs);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === "today") return bought >= start;
  if (range === "week") {
    const day = start.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - mondayOffset);
    return bought >= start;
  }
  return bought.getFullYear() === now.getFullYear() && bought.getMonth() === now.getMonth();
}
