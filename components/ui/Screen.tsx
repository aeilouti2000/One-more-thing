import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/providers/ThemeProvider";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  tabBarInset?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
};

export function Screen({
  children,
  scroll = true,
  tabBarInset = false,
  refreshing = false,
  onRefresh,
}: ScreenProps) {
  const { colors } = useTheme();
  const padding = tabBarInset
    ? "px-5 pb-32 pt-2"
    : "px-5 pb-10 pt-2";

  return (
    <SafeAreaView
      className="flex-1 bg-cove-ice"
      style={{ backgroundColor: colors.ice }}
      edges={["top"]}
    >
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={padding}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            ) : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 ${padding}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}
