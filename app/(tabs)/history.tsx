import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { PurchaseRow } from "@/components/purchases/PurchaseRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormMessage } from "@/components/ui/FormMessage";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { usePurchases } from "@/hooks/usePurchases";
import { useI18n } from "@/providers/LanguageProvider";

export default function HistoryScreen() {
  const { bought, isLoading, error, refresh } = usePurchases();
  const { t } = useI18n();
  const [isRefreshing, setIsRefreshing] = useState(false);

  async function onRefresh() {
    setIsRefreshing(true);
    await refresh();
    setIsRefreshing(false);
  }

  if (isLoading && bought.length === 0 && !error) {
    return <LoadingScreen />;
  }

  return (
    <Screen
      tabBarInset
      refreshing={isRefreshing}
      onRefresh={() => void onRefresh()}
    >
      <ScreenHeader
        title={t("historyTitle")}
        subtitle={t("historySubtitle")}
      />

      <FormMessage message={error} />

      {bought.length === 0 ? (
        <EmptyState
          title={t("noPurchases")}
          message={t("noPurchasesBody")}
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
