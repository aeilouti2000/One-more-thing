import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { HistoryDateField } from "@/components/purchases/HistoryDateField";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { usePurchases } from "@/hooks/usePurchases";
import { canUndoBought } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import type { Purchase } from "@/types/purchase";

type HistoryRange = "all" | "today" | "week" | "month";

const HISTORY_RANGES: HistoryRange[] = ["all", "today", "week", "month"];

export default function HistoryScreen() {
  const { bought, isLoading, error, refresh, undoBought, addItem } = usePurchases();
  const { t, locale } = useI18n();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [undoError, setUndoError] = useState<string | null>(null);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [buyAgainId, setBuyAgainId] = useState<string | null>(null);
  const [buyAgainNotice, setBuyAgainNotice] = useState<string | null>(null);
  const [range, setRange] = useState<HistoryRange>("all");
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const hasUndo = bought.some((item) => canUndoBought(item.boughtAt, now));
  const visible = bought.filter((item) =>
    pickedDate ? sameLocalDay(item.boughtAt, pickedDate) : boughtInRange(item.boughtAt, range, now),
  );
  const pickedLabel = pickedDate
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(pickedDate)
    : null;
  const rangeLabel: Record<HistoryRange, string> = {
    all: t("all"),
    today: t("historyToday"),
    week: t("historyWeek"),
    month: t("historyMonth"),
  };

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
        <View key={locale} className="mb-5 flex-row flex-wrap gap-2">
          {HISTORY_RANGES.map((item) => (
            <CategoryChip
              key={`${item}-${locale}`}
              label={rangeLabel[item]}
              selected={pickedDate === null && range === item}
              onPress={() => {
                setPickedDate(null);
                setRange(item);
              }}
            />
          ))}
          <HistoryDateField
            value={pickedDate}
            onChange={(date) => setPickedDate(date)}
          />
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
      ) : (
        <View className="gap-3">
          {visible.map((purchase) => (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              onPress={() => router.push({
                pathname: "/item/[id]",
                params: { id: purchase.id },
              })}
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
    </Screen>
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
