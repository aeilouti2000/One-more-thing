import { router } from "expo-router";
import { View } from "react-native";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { usePurchases } from "@/hooks/usePurchases";

export default function HistoryScreen() {
  const { bought } = usePurchases();

  return (
    <Screen tabBarInset>
      <ScreenHeader
        title="History"
        subtitle="Items already picked up"
      />

      {bought.length === 0 ? (
        <EmptyState
          title="No purchases yet"
          message="Bought items will land here so you can look back later."
        />
      ) : (
        <View className="gap-3">
          {bought.map((purchase) => (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              onPress={() => router.push({
                pathname: "/item/[id]",
                params: { id: purchase.id },
              })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
