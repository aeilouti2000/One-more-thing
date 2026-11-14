import { useCallback, useState } from "react";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useCategoryLabeler } from "@/features/items/providers/categories-provider";
import type { Purchase } from "@/features/items/types/purchase";
import { summarizeSpend } from "@/features/items/utils/currency";
import { shareCsvFile } from "@/features/items/utils/export-file";
import { purchasesToCsv, TRIP_TOTALS } from "@/features/items/utils/insights";
import { useI18n } from "@/providers/LanguageProvider";

/** Shares a set of bought items as a spreadsheet file. */
export function useExportPurchases() {
  const { household } = useHousehold();
  const { t } = useI18n();
  const categoryLabel = useCategoryLabeler();
  const [isExporting, setIsExporting] = useState(false);

  const exportItems = useCallback(
    async (items: Purchase[], name: string): Promise<{ error: string | null }> => {
      if (items.length === 0) return { error: t("exportEmpty") };
      setIsExporting(true);
      try {
        const csv = purchasesToCsv(
          items,
          {
            date: t("exportDate"),
            item: t("exportItem"),
            quantity: t("quantity"),
            unit: t("exportUnit"),
            category: t("category"),
            list: t("exportList"),
            boughtBy: t("exportBoughtBy"),
            price: `${t("exportPrice")} (${household?.currency ?? ""})`,
            invoice: t("invoiceTitle"),
            invoiceTotal: t("exportInvoiceTotal"),
            total: t("exportTotal"),
          },
          (category) => (category === TRIP_TOTALS ? t("tripTotals") : categoryLabel(category)),
          summarizeSpend(items).total,
        );
        const safe = name.replace(/[^\w؀-ۿ-]+/g, "-").replace(/^-+|-+$/g, "");
        const result = await shareCsvFile(`one-more-thing-${safe || "export"}.csv`, csv, t("exportTitle"));
        return { error: result === "unavailable" ? t("exportUnavailable") : null };
      } catch {
        return { error: t("exportFailed") };
      } finally {
        setIsExporting(false);
      }
    },
    [categoryLabel, household?.currency, t],
  );

  return { exportItems, isExporting };
}
