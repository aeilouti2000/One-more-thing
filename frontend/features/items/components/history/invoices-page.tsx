import type { Ionicons } from "@expo/vector-icons";
import type { ReactElement, ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { EmptyState } from "@/components/ui/EmptyState";
import type { HistoryTrip, MonthStats } from "@/features/items/api/history";
import {
  HistoryNote,
  monthShort,
  SkeletonRows,
  useCountUp,
} from "@/features/items/components/history/history-parts";
import { FilterChip } from "@/features/items/components/history/purchases-page";
import { ReceiptCard } from "@/features/items/components/history/receipt-card";
import { formatMoney } from "@/features/items/utils/currency";
import { useI18n } from "@/providers/LanguageProvider";

export type InvoicesRow =
  | { type: "summary"; key: string; trips: number; total: number }
  | { type: "trip"; key: string; trip: HistoryTrip }
  | { type: "skeleton"; key: string; count: number }
  | { type: "note"; key: string; icon: keyof typeof Ionicons.glyphMap; text: string }
  | { type: "empty"; key: string }
  | { type: "detail"; key: string };

type TripsState = {
  trips: HistoryTrip[];
  loaded: boolean;
  hasMore: boolean;
  waitingOffline: boolean;
  failed: boolean;
  loadMore: () => void;
};

/**
 * The Invoices page: month chips and the list filter (its list header), a
 * summary card, then one receipt card per trip, 20 at a time. An opened trip
 * replaces the cards on a phone; on a fold it opens beside them.
 */
export function useInvoicesPage({
  months,
  month,
  title,
  onMonth,
  stats,
  list,
  currency,
  listChip,
  filtered,
  openTripId,
  wide,
  tripDetail,
  onOpenTrip,
}: {
  months: string[];
  month: string;
  title: string;
  onMonth: (month: string) => void;
  stats: MonthStats | null;
  list: TripsState;
  currency: string;
  listChip: ReactNode;
  /** A list filter is on: the month's totals don't apply, the shown trips are summed. */
  filtered: boolean;
  openTripId: string | null;
  wide: boolean;
  /** The opened trip, drawn by the screen (it owns the rename and move sheets). */
  tripDetail: ReactElement | null;
  onOpenTrip: (trip: HistoryTrip) => void;
}) {
  const { t, locale } = useI18n();
  const archived = stats?.state === "archived";

  const header = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      className="mb-3"
      contentContainerStyle={{ gap: 6 }}
    >
      {months.map((entry) => (
        <FilterChip
          key={entry}
          label={monthShort(entry, locale)}
          selected={entry === month}
          onPress={() => onMonth(entry)}
        />
      ))}
      {listChip}
    </ScrollView>
  );

  const rows: InvoicesRow[] = [];
  if (tripDetail && !wide) {
    rows.push({ type: "detail", key: `detail:${openTripId}` });
  } else if (archived && stats) {
    rows.push({
      type: "note",
      key: "archived",
      icon: "archive-outline",
      text: t("historyCleanedInvoices", {
        month: title,
        trips: stats.tripCount,
        total: formatMoney(stats.spend, currency),
      }),
    });
  } else if (!list.loaded) {
    rows.push(
      list.waitingOffline
        ? { type: "note", key: "offline", icon: "cloud-offline-outline", text: t("historyOfflineMonth", { month: title }) }
        : list.failed
          ? { type: "note", key: "failed", icon: "alert-circle-outline", text: t("historyLoadFailed") }
          : { type: "skeleton", key: "skeleton", count: 4 },
    );
  } else if (list.trips.length === 0) {
    rows.push({ type: "empty", key: "empty" });
  } else {
    // Month totals come from the server (the list may still be partly loaded);
    // with a list filter, the trips of that list are summed.
    const shown = list.trips.reduce((sum, trip) => sum + trip.total, 0);
    const trips = filtered || !stats ? list.trips.length : stats.tripCount;
    const total = filtered || !stats ? Math.round(shown * 1000) / 1000 : stats.spend;
    rows.push({ type: "summary", key: `summary:${month}`, trips, total });
    for (const trip of list.trips) rows.push({ type: "trip", key: trip.id, trip });
    if (list.hasMore) rows.push({ type: "skeleton", key: "more", count: 2 });
  }

  function renderRow(row: InvoicesRow): ReactElement | null {
    switch (row.type) {
      case "summary":
        return <TripsSummary trips={row.trips} total={row.total} currency={currency} />;
      case "trip":
        return (
          <ReceiptCard
            trip={row.trip}
            currency={currency}
            selected={wide && openTripId === row.trip.id}
            onOpen={() => onOpenTrip(row.trip)}
          />
        );
      case "skeleton":
        return (
          <View className="mb-3">
            <SkeletonRows count={row.count} />
          </View>
        );
      case "note":
        return <HistoryNote icon={row.icon} text={row.text} />;
      case "empty":
        return <EmptyState title={t("invoiceEmpty")} message={t("invoiceEmptyBody")} />;
      case "detail":
        return tripDetail;
    }
  }

  return {
    key: `invoices:${month}`,
    header,
    rows,
    renderRow,
    onEndReached: tripDetail && !wide ? undefined : list.loadMore,
  };
}

function TripsSummary({ trips, total, currency }: { trips: number; total: number; currency: string }) {
  const { t } = useI18n();
  const shown = useCountUp(total);
  return (
    <View className="mb-3 flex-row items-end justify-between rounded-3xl bg-cove-paper p-3.5">
      <View className="min-w-0 flex-1">
        <AppText className="text-xs text-cove-muted">{t("historyTripsThisMonth", { count: trips })}</AppText>
        <AppText className="text-[27px] font-bold tracking-tight text-cove-ink" style={{ fontVariant: ["tabular-nums"] }}>
          {formatMoney(shown, currency)}
        </AppText>
      </View>
      <View className="items-end">
        <AppText className="text-xs text-cove-muted">{t("historyAverageTrip")}</AppText>
        <AppText className="text-sm font-semibold text-cove-ink">
          {formatMoney(trips > 0 ? total / trips : 0, currency)}
        </AppText>
      </View>
    </View>
  );
}
