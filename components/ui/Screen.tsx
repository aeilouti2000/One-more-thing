import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  tabBarInset?: boolean;
};

export function Screen({
  children,
  scroll = true,
  tabBarInset = false,
}: ScreenProps) {
  const padding = tabBarInset
    ? "px-5 pb-32 pt-2"
    : "px-5 pb-10 pt-2";

  return (
    <SafeAreaView className="flex-1 bg-cove-ice" edges={["top"]}>
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerClassName={padding}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 ${padding}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}
