import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ReactElement, ReactNode, RefObject } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { EmptyState } from "@/components/ui/EmptyState";
import { HomeIcon } from "@/components/ui/HomeIcon";
import type { MonthStats } from "@/features/items/api/history";
import { CategoryBar, useCategoryName } from "@/features/items/components/history/category-bar";
import {
  DayHeader,
  dayTitle,
  HistoryNote,
  SkeletonRows,
  useLocaleLabels,
} from "@/features/items/components/history/history-parts";
import { MonthArchiveCard } from "@/features/items/components/history/month-archive-card";
import { MonthHero } from "@/features/items/components/history/month-hero";
import type { Purchase } from "@/features/items/types/purchase";
import { dayRows, type DayRow, type PurchaseItemRow } from "@/features/items/utils/history";
import { formatMoney, sumKnownCosts } from "@/features/items/utils/currency";
import type { ViewHandle } from "@/lib/native-refs";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export type PurchasesRow =
  | DayRow
  | PurchaseItemRow
  | { type: "skeleton"; key: string; count: number }
  | { type: "note"; key: string; icon: keyof typeof Ionicons.glyphMap; text: string }
  | { type: "empty"; key: string; title: string; body: string }
  | { type: "archive"; key: string; stats: MonthStats }
  | { type: "end"; key: string; text: string };

type PurchasesState = {
  purchases: Purchase[];
  loaded: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  waitingOffline: boolean;
  failed: boolean;
  loadMore: () => void;
};

/**
 * The Purchases page: the month hero, the category bar, the filter chips
 * (its list header), then the month's purchases grouped by day, 30 at a time.
 * Search replaces the month's list with matches from every kept month.
 */
export function usePurchasesPage({
  month,
  title,
  stats,
  list,
  costsEnabled,
  currency,
  canOlder,
  canNewer,
  onOlder,
  onNewer,
  category,
  onCategory,
  listChip,
  searching,
  searchText,
  query,
  onSearchText,
  onToggleSearch,
  exporting,
  onExport,
  notice,
  top,
  onKeepMore,
  renderPurchase,
}: {
  month: string;
  title: string;
  stats: MonthStats | null;
  list: PurchasesState;
  costsEnabled: boolean;
  currency: string;
  canOlder: boolean;
  canNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
  category: string | null;
  onCategory: (category: string | null) => void;
  /** The list filter chip (shared with Invoices). */
  listChip: ReactNode;
  searching: boolean;
  searchText: string;
  /** The search text the list follows (after the 300 ms wait). */
  query: string;
  onSearchText: (text: string) => void;
  onToggleSearch: () => void;
  exporting: boolean;
  onExport?: () => void;
  /** Shown above everything, on every month (the History period notice). */
  notice?: ReactNode;
  /** Shown first (the recap card of the current month). */
  top?: ReactNode;
  /** The host can keep more months: a link under a cleaned month's summary. */
  onKeepMore?: () => void;
  renderPurchase: (purchase: Purchase) => ReactElement;
}) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const labels = useLocaleLabels();
  const categoryName = useCategoryName();
  const archived = stats?.state === "archived";
  const searchingNow = searching && query.length > 0;

  const chipCategories = (stats?.categories ?? [])
    .filter((row) => row.category !== "" && row.itemCount > 0)
    .map((row) => row.category);
  if (category && !chipCategories.includes(category)) chipCategories.push(category);

  const header = (
    <View>
      {searching ? null : notice}
      {top}
      <MonthHero
        title={title}
        total={stats ? stats.spend : null}
        itemCount={stats ? stats.itemCount : null}
        budget={stats?.budget ?? null}
        currency={currency}
        costsEnabled={costsEnabled}
        archived={archived}
        canOlder={canOlder}
        canNewer={canNewer}
        onOlder={onOlder}
        onNewer={onNewer}
        exporting={exporting}
        onExport={onExport}
        searching={searching}
        onSearch={onToggleSearch}
      />
      {searching ? (
        <View className="mb-3">
          <AppTextField
            value={searchText}
            onChangeText={onSearchText}
            placeholder={t("searchHistoryPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            userText
            compact
          />
        </View>
      ) : null}
      {!searching && !archived && costsEnabled ? <CategoryBar stats={stats} currency={currency} /> : null}
      {!searching && !archived ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="mb-3"
          contentContainerStyle={{ gap: 6 }}
        >
          <FilterChip label={t("all")} selected={category === null} onPress={() => onCategory(null)} />
          {chipCategories.map((id) => (
            <FilterChip
              key={id}
              label={categoryName(id)}
              icon={<HomeIcon kind="category" id={id} size={20} radius={7} />}
              selected={category === id}
              onPress={() => onCategory(category === id ? null : id)}
            />
          ))}
          {listChip}
        </ScrollView>
      ) : null}
    </View>
  );

  const rows: PurchasesRow[] = [];
  if (searching && !query) {
    rows.push({ type: "note", key: "search-hint", icon: "search", text: t("searchHistoryHint") });
  } else if (!searchingNow && archived && stats) {
    rows.push({ type: "archive", key: "archive", stats });
  } else if (!list.loaded) {
    rows.push(
      list.waitingOffline
        ? { type: "note", key: "offline", icon: "cloud-offline-outline", text: t("historyOfflineMonth", { month: title }) }
        : list.failed
          ? { type: "note", key: "failed", icon: "alert-circle-outline", text: t("historyLoadFailed") }
          : { type: "skeleton", key: "skeleton", count: 5 },
    );
  } else if (list.purchases.length === 0) {
    rows.push(
      searchingNow
        ? { type: "empty", key: "empty", title: t("searchNoResults"), body: t("searchNoResultsBody", { name: query }) }
        : category
          ? { type: "empty", key: "empty", title: t("historyFilterEmpty"), body: t("historyCategoryEmptyBody") }
          : { type: "empty", key: "empty", title: t("noPurchases"), body: t("historyMonthEmptyBody", { month: title }) },
    );
  } else {
    if (searchingNow) {
      const spend = sumKnownCosts(list.purchases.map((item) => item.cost));
      const count = list.hasMore ? `${list.purchases.length}+` : String(list.purchases.length);
      rows.push({
        type: "end",
        key: "search-count",
        text:
          costsEnabled && spend.priced > 0 && !list.hasMore
            ? t("searchResultsSpend", { count, total: formatMoney(spend.total, currency) })
            : t("historySearchFound", { count }),
      });
    }
    rows.push(...dayRows(list.purchases, { hasMore: list.hasMore, totals: costsEnabled && !searchingNow }));
    if (list.hasMore) rows.push({ type: "skeleton", key: "more", count: 2 });
    else if (!searchingNow) rows.push({ type: "end", key: "end", text: t("historyEndOfMonth", { month: title }) });
  }

  function renderRow(row: PurchasesRow): ReactElement | null {
    switch (row.type) {
      case "day":
        return <DayHeader title={dayTitle(row.day, locale, labels)} total={row.total} currency={currency} />;
      case "item":
        return <View className="mb-3">{renderPurchase(row.purchase)}</View>;
      case "skeleton":
        return (
          <View className="mb-3">
            <SkeletonRows count={row.count} />
          </View>
        );
      case "note":
        return <HistoryNote icon={row.icon} text={row.text} />;
      case "empty":
        return <EmptyState title={row.title} message={row.body} />;
      case "archive":
        return (
          <MonthArchiveCard
            stats={row.stats}
            title={title}
            currency={currency}
            costsEnabled={costsEnabled}
            onKeepMore={onKeepMore}
          />
        );
      case "end":
        return (
          <AppText className="px-2 pb-2 pt-1 text-center text-xs" style={{ color: colors.muted }}>
            {row.text}
          </AppText>
        );
    }
  }

  return {
    key: `purchases:${month}`,
    header,
    rows,
    renderRow,
    onEndReached: list.loadMore,
  };
}

/** A filter chip: All, a category (with its icon), or the list menu. */
export function FilterChip({
  label,
  icon,
  selected,
  trailing,
  onPress,
  chipRef,
}: {
  label: string;
  icon?: ReactNode;
  selected: boolean;
  trailing?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  chipRef?: RefObject<ViewHandle | null>;
}) {
  const { colors } = useTheme();
  return (
    <View ref={chipRef} collapsable={false}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
        className="h-[34px] flex-row items-center gap-1.5 rounded-full active:opacity-80"
        style={{
          paddingStart: icon ? 6 : 12,
          paddingEnd: 12,
          backgroundColor: selected ? colors.accent : colors.paper,
          borderWidth: 1,
          borderColor: selected ? colors.accent : colors.line,
        }}
      >
        {icon}
        <AppText
          className="text-xs font-semibold"
          numberOfLines={1}
          style={{ color: selected ? colors.onAccent : colors.ink }}
        >
          {label}
        </AppText>
        {trailing ? (
          <Ionicons name={trailing} size={13} color={selected ? colors.onAccent : colors.accentText} />
        ) : null}
      </Pressable>
    </View>
  );
}
