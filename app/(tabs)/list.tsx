import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { CategoryChip } from "@/components/purchases/CategoryChip";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { PURCHASE_CATEGORIES } from "@/constants/categories";
import { useHousehold } from "@/hooks/useHousehold";
import { usePurchases } from "@/hooks/usePurchases";
import type { PurchaseCategory } from "@/types/purchase";

export default function ListScreen() {
  const { household } = useHousehold();
  const { needed } = usePurchases();
  const [category, setCategory] = useState<PurchaseCategory | "all">("all");

  const visibleItems =
    category === "all"
      ? needed
      : needed.filter((item) => item.category === category);

  return (
    <Screen tabBarInset>
      <ScreenHeader
        title={household?.name ?? "Your list"}
        subtitle={`${needed.length} still to get`}
        right={
          <Pressable
            onPress={() => router.push("/item/new")}
            className="h-11 w-11 items-center justify-center rounded-full bg-cove-accent"
          >
            <Ionicons name="add" size={26} color="#FFFFFF" />
          </Pressable>
        }
      />

      <View className="mb-5 flex-row flex-wrap gap-2">
        <CategoryChip
          label="All"
          selected={category === "all"}
          onPress={() => setCategory("all")}
        />
        {PURCHASE_CATEGORIES.map((item) => (
          <CategoryChip
            key={item.id}
            label={item.label}
            selected={category === item.id}
            onPress={() => setCategory(item.id)}
          />
        ))}
      </View>

      {visibleItems.length === 0 ? (
        <EmptyState
          title="Nothing to buy"
          message="Add the first item so you and your partner stay in sync."
        />
      ) : (
        <View className="gap-3">
          {visibleItems.map((purchase) => (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              onPress={() =>
                router.push({
                  pathname: "/item/[id]",
                  params: { id: purchase.id },
                })
              }
            />
          ))}
        </View>
      )}
    </Screen>
  );
}
