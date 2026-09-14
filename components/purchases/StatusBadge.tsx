import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import type { PurchaseStatus } from "@/types/purchase";

type StatusBadgeProps = {
  status: PurchaseStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t, isRTL } = useI18n();
  const isBought = status === "bought";

  return (
    <View
      className={`rounded-full px-3 py-1 ${
        isBought ? "bg-cove-soft" : "bg-cove-mist"
      }`}
    >
      <AppText
        className={`text-xs font-semibold ${
          isRTL ? "" : "uppercase tracking-wide"
        } ${isBought ? "text-cove-ink" : "text-cove-accent"}`}
      >
        {isBought ? t("bought") : t("needed")}
      </AppText>
    </View>
  );
}
