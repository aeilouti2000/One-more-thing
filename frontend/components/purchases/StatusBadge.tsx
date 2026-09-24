import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import type { PurchaseStatus } from "@/types/purchase";

type StatusBadgeProps = {
  status: PurchaseStatus;
};

export function UrgentBadge() {
  const { t, isRTL } = useI18n();

  return (
    <View className="rounded-full px-3 py-1" style={{ backgroundColor: "#FEE2E2" }}>
      <AppText
        className={`text-xs font-semibold ${isRTL ? "" : "uppercase tracking-wide"}`}
        style={{ color: "#B91C1C" }}
      >
        {t("urgent")}
      </AppText>
    </View>
  );
}

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
