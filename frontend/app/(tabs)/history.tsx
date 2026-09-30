import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Modal, Pressable, View } from "react-native";
import { HistoryDateField } from "@/components/purchases/HistoryDateField";
import { ItemDetailCard } from "@/components/purchases/ItemDetailCard";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { AppText } from "@/components/ui/AppText";
import { BlurBackdrop, FrostedFill } from "@/components/ui/BlurBackdrop";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { usePurchases } from "@/hooks/usePurchases";
import { useHousehold } from "@/hooks/useHousehold";
import { fetchLists, listLabel, type HomeList } from "@/lib/lists";
import { canUndoBought } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { iconSize } from "@/constants/theme";
import type { Purchase } from "@/types/purchase";

type HistoryRange = "all" | "today" | "week" | "month";

const HISTORY_RANGES: HistoryRange[] = ["all", "today", "week", "month"];

export default function HistoryScreen() {
  const { bought, isLoading, error, refresh, undoBought, addItem } = usePurchases();
  const { household } = useHousehold();
  const { t, locale } = useI18n();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [buyAgainId, setBuyAgainId] = useState<string | null>(null);
  const [buyAgainNotice, setBuyAgainNotice] = useState<string | null>(null);
  const [range, setRange] = useState<HistoryRange>("all");
  const [lists, setLists] = useState<HomeList[]>([]);
  const [listId, setListId] = useState<string>("all");
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [isChoosingList, setIsChoosingList] = useState(false);
  const [isChoosingRange, setIsChoosingRange] = useState(false);
  const [openItem, setOpenItem] = useState<Purchase | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasUndo = bought.some((item) => canUndoBought(item.boughtAt, now));
  const visible = bought.filter((item) => {
    const inList = listId === "all" || item.listId === listId;
    const inDate = pickedDate
      ? sameLocalDay(item.boughtAt, pickedDate)
      : boughtInRange(item.boughtAt, range, now);
    return inList && inDate;
  });
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

  useFocusEffect(
    useCallback(() => {
      if (!household) {
        setLists([]);
        return;
      }
      void fetchLists(household.id).then((result) => setLists(result.lists));
    }, [household]),
  );

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
    const result = await addItem({
      name: purchase.name,
      quantity: purchase.quantity,
      category: purchase.category,
      unit: purchase.unit,
      notes: purchase.notes,
      listId: purchase.listId,
    });
    setBuyAgainId(null);
    if (result.error) {
      setUndoError(result.error);
      return;
    }
    setBuyAgainNotice(t("boughtAgain"));
  }

  async function onRefresh() {
    setIsRefreshing(true);
    await refresh();
    if (household) {
      const result = await fetchLists(household.id);
      setLists(result.lists);
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
    >
      <ScreenHeader
        title={t("historyTitle")}
        subtitle={t("historySubtitle")}
      />

      {bought.length > 0 ? (
        <HistoryDateField
          value={pickedDate}
          onChange={(date) => setPickedDate(date)}
          leading={
            <>
              <ChoiceButton
                icon="list-outline"
                selected={listId !== "all"}
                label={
                  listId === "all"
                    ? t("allLists")
                    : listLabel(lists.find((list) => list.id === listId)?.name ?? "", t("defaultList"))
                }
                onPress={() => setIsChoosingList(true)}
              />
              <ChoiceButton
                icon="time-outline"
                selected={pickedDate !== null || range !== "all"}
                label={pickedLabel ?? rangeLabel[range]}
                onPress={() => setIsChoosingRange(true)}
              />
            </>
          }
        />
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

      <ItemDetailCard
        purchase={openItem}
        visible={openItem !== null}
        onClose={() => setOpenItem(null)}
      />

      <OptionMenu
        visible={isChoosingList}
        options={[
          { id: "all", label: t("allLists") },
          ...lists.map((list) => ({
            id: list.id,
            label: listLabel(list.name, t("defaultList")),
          })),
        ]}
        selectedId={listId}
        onSelect={(id) => setListId(id)}
        onClose={() => setIsChoosingList(false)}
      />
      <OptionMenu
        visible={isChoosingRange}
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
      className="min-w-0 flex-1 flex-row items-center gap-1 rounded-full px-2 py-2"
      style={{ backgroundColor: selected ? colors.accent : colors.paper }}
    >
      <Ionicons name={icon} size={14} color={selected ? colors.white : colors.ink} />
      <AppText
        numberOfLines={1}
        className="min-w-0 flex-1 text-xs font-medium"
        style={{ color: selected ? colors.white : colors.ink }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

function OptionMenu({
  visible,
  options,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  options: { id: string; label: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center px-6">
        <BlurBackdrop onPress={onClose} />
        <View className="w-full max-w-md gap-1 overflow-hidden rounded-3xl border border-cove-line p-3">
          <FrostedFill />
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
                  className="text-sm font-medium"
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
        </View>
      </View>
    </Modal>
  );
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
