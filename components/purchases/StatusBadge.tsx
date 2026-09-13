import { Text, View } from "react-native";
import type { PurchaseStatus } from "@/types/purchase";

type StatusBadgeProps = {
  status: PurchaseStatus;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const isBought = status === "bought";

  return (
    <View
      className={`rounded-full px-3 py-1 ${
        isBought ? "bg-cove-soft" : "bg-cove-mist"
      }`}
    >
      <Text
        className={`text-xs font-semibold uppercase tracking-wide ${
          isBought ? "text-cove-ink" : "text-cove-accent"
        }`}
      >
        {isBought ? "Bought" : "Needed"}
      </Text>
    </View>
  );
}
