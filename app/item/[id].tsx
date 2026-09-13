import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { StatusBadge } from "@/components/purchases/StatusBadge";
import { AppButton } from "@/components/ui/AppButton";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getCategoryLabel } from "@/constants/categories";
import { usePurchases } from "@/hooks/usePurchases";

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getById } = usePurchases();
  const purchase = getById(id ?? "");

  if (!purchase) {
    return (
      <Screen>
        <ScreenHeader title="Item" showBack />
        <Text className="text-base text-cove-muted">
          This item is not in the preview data.
        </Text>
      </Screen>
    );
  }

  const quantityLabel = purchase.unit
    ? `${purchase.quantity} ${purchase.unit}`
    : `${purchase.quantity}`;

  return (
    <Screen>
      <ScreenHeader title={purchase.name} showBack />

      <View className="gap-4">
        <View className="flex-row items-center justify-between rounded-3xl bg-cove-paper px-5 py-4">
          <Text className="text-base text-cove-muted">Status</Text>
          <StatusBadge status={purchase.status} />
        </View>

        <View className="gap-4 rounded-3xl bg-cove-paper px-5 py-5">
          <DetailRow label="Quantity" value={quantityLabel} />
          <DetailRow
            label="Category"
            value={getCategoryLabel(purchase.category)}
          />
          <DetailRow label="Added by" value={purchase.addedByName} />
          {purchase.boughtByName ? (
            <DetailRow label="Bought by" value={purchase.boughtByName} />
          ) : null}
          {purchase.notes ? (
            <DetailRow label="Notes" value={purchase.notes} />
          ) : null}
        </View>

        {purchase.status === "needed" ? (
          <AppButton label="Mark as bought" onPress={() => router.back()} />
        ) : (
          <AppButton
            label="Back to history"
            variant="secondary"
            onPress={() => router.back()}
          />
        )}
      </View>
    </Screen>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-sm text-cove-muted">{label}</Text>
      <Text className="mt-1 text-base font-medium text-cove-ink">{value}</Text>
    </View>
  );
}
