import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { CostEntrySheet } from "@/features/items/components/cost-entry-sheet";
import { ReceiptSourceModal } from "@/features/items/components/receipt-source-modal";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import { useReceiptScanner } from "@/features/items/hooks/use-receipt-scanner";
import type { Purchase } from "@/features/items/types/purchase";
import type { ReceiptScan } from "@/features/items/utils/scan-receipt";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const TOTAL_ROW_ID = "trip-total";
const TOTAL_LINE_ID = "receipt-total";

type Sheet = "items" | "total";

/**
 * Cost actions for one trip in History → Invoice, for when the receipt wasn't
 * scanned or priced at the end of the trip: scan it now, price items, or
 * enter one total for the whole invoice.
 */
export function TripInvoiceCosts({
  items,
  currency,
}: {
  items: Purchase[];
  currency: string;
}) {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const { updateCosts, saveTripTotal, bought } = usePurchases();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receiptTotal = items.find((item) => item.receiptId)?.receiptTotal ?? null;
  // A trip saved as one total is edited as a total (item prices wouldn't count).
  const hasTotal = items.some((item) => item.receiptId);
  const listId = items[0]?.listId ?? null;
  const canScan = Platform.OS !== "web";

  const itemRows = useMemo(
    () =>
      items.map((item) => ({ id: item.id, name: item.name, initialCost: item.cost ?? null })),
    [items],
  );
  const totalRows = useMemo(
    () => [{ id: TOTAL_ROW_ID, name: t("tripTotalLabel"), initialCost: receiptTotal }],
    [receiptTotal, t],
  );

  const scanner = useReceiptScanner({
    getItems: () => itemRows,
    onScanned: () => {
      // Scan from the button row: show the matched prices for review.
      setSheet((current) => current ?? "items");
    },
  });

  // For the total sheet, feed the receipt's total into the single field.
  const totalReceipt: ReceiptScan | null = useMemo(() => {
    const scan = scanner.scan;
    if (!scan || scan.total === null) return null;
    return {
      scanId: scan.scanId,
      total: scan.total,
      lines: [{ id: TOTAL_LINE_ID, name: t("tripTotalLabel"), amount: scan.total }],
      matches: [{ itemId: TOTAL_ROW_ID, lineId: TOTAL_LINE_ID }],
    };
  }, [scanner.scan, t]);

  function open(next: Sheet) {
    setError(null);
    scanner.reset();
    setSheet(next);
  }

  function close() {
    if (saving || scanner.scanning) return;
    setSheet(null);
    scanner.reset();
    setError(null);
  }

  function scanFromRow() {
    scanner.reset();
    scanner.choose();
  }

  async function saveItemPrices(entries: { id: string; cost: number | null }[]) {
    const current = new Map(items.map((item) => [item.id, item.cost ?? null]));
    const changed = entries.filter((entry) => entry.cost !== current.get(entry.id));
    if (changed.length === 0) {
      close();
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateCosts(changed);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSheet(null);
    scanner.reset();
  }

  async function saveTotal(total: number | null) {
    if (total === null) {
      close();
      return;
    }
    setSaving(true);
    setError(null);
    // Include every item already on this trip's receipt — some may be hidden by
    // History's date filter — so the old total can't survive and count twice.
    const receiptIds = new Set(items.map((item) => item.receiptId).filter(Boolean));
    const itemIds = new Set(items.map((item) => item.id));
    for (const item of bought) {
      if (item.receiptId && receiptIds.has(item.receiptId)) itemIds.add(item.id);
    }
    const result = await saveTripTotal({ total, itemIds: [...itemIds], listId });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSheet(null);
    scanner.reset();
  }

  const chipBorder = withAlpha(colors.accent, scheme === "dark" ? 0.45 : 0.35);

  return (
    <>
      <View
        className="mt-4 flex-row flex-wrap gap-2"
        style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
      >
        {canScan && !hasTotal ? (
          <ActionChip
            icon="scan-outline"
            label={t("scanReceipt")}
            primary
            onPress={scanFromRow}
            borderColor={chipBorder}
          />
        ) : null}
        {hasTotal ? null : (
          <ActionChip
            icon="pricetags-outline"
            label={t("tripItemPrices")}
            onPress={() => open("items")}
            borderColor={chipBorder}
          />
        )}
        <ActionChip
          icon="receipt-outline"
          label={hasTotal ? t("editTripTotal") : t("tripTotalTitle")}
          primary={hasTotal}
          onPress={() => open("total")}
          borderColor={chipBorder}
        />
      </View>
      {sheet === null ? <FormMessage message={scanner.error ?? error} /> : null}

      <CostEntrySheet
        visible={sheet === "items"}
        title={t("tripItemPrices")}
        subtitle={t("tripItemPricesBody")}
        currency={currency}
        items={itemRows}
        loading={saving}
        scanning={scanner.scanning}
        covered={scanner.covered}
        onScan={canScan ? scanner.choose : undefined}
        receipt={scanner.scan}
        errorMessage={scanner.error ?? error}
        skipLabel={t("cancel")}
        onConfirm={(entries) => void saveItemPrices(entries)}
        onSkip={close}
        onClose={close}
      />

      <CostEntrySheet
        visible={sheet === "total"}
        title={t("tripTotalTitle")}
        subtitle={`${t("tripTotalSubtitle")}\n${t("tripTotalItems", { count: items.length })}`}
        currency={currency}
        items={totalRows}
        loading={saving}
        scanning={scanner.scanning}
        covered={scanner.covered}
        onScan={canScan ? scanner.choose : undefined}
        receipt={totalReceipt}
        errorMessage={scanner.error ?? error}
        skipLabel={t("cancel")}
        onConfirm={(entries) => void saveTotal(entries[0]?.cost ?? null)}
        onSkip={close}
        onClose={close}
      />

      <ReceiptSourceModal
        visible={scanner.sourceOpen || scanner.reading}
        reading={scanner.reading}
        onCamera={() => scanner.start("camera")}
        onLibrary={() => scanner.start("library")}
        onClose={scanner.closeSource}
      />
    </>
  );
}

function ActionChip({
  icon,
  label,
  primary = false,
  borderColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  primary?: boolean;
  borderColor: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-75"
      style={{
        backgroundColor: primary ? colors.accent : withAlpha(colors.accent, 0.08),
        borderWidth: primary ? 0 : 1,
        borderColor,
      }}
    >
      <Ionicons name={icon} size={16} color={primary ? colors.onAccent : colors.accent} />
      <AppText
        numberOfLines={1}
        className="text-sm font-semibold"
        style={{ color: primary ? colors.onAccent : colors.ink }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
