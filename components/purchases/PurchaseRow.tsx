import { Pressable, Text, View } from "react-native";
import { getCategoryLabel } from "@/constants/categories";
import type { Purchase } from "@/types/purchase";
import { StatusBadge } from "./StatusBadge";

type PurchaseRowProps = {
  purchase: Purchase;
  onPress?: () => void;
};

export function PurchaseRow({ purchase, onPress }: PurchaseRowProps) {
  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `x${purchase.quantity}`;

  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
    >
      <View className="min-w-0 flex-1 pr-3">
        <Text className="text-base font-semibold text-cove-ink">
          {purchase.name}
        </Text>
        <Text className="mt-1 text-sm text-cove-muted">
          {quantityLabel} · {getCategoryLabel(purchase.category)} ·{" "}
          {purchase.status === "bought"
            ? `Bought by ${purchase.boughtByName}`
            : `Added by ${purchase.addedByName}`}
        </Text>
      </View>
      <StatusBadge status={purchase.status} />
    </Pressable>
  );
}
