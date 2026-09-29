import { useMemo, useRef, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView as GestureScrollView,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@/providers/ThemeProvider";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  scrollEnabled?: boolean;
  tabBarInset?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  floating?: ReactNode;
  onSwipe?: (direction: "next" | "previous") => void;
};

export function Screen({
  children,
  scroll = true,
  scrollEnabled = true,
  tabBarInset = false,
  refreshing = false,
  onRefresh,
  floating,
  onSwipe,
}: ScreenProps) {
  const { colors } = useTheme();
  const swipeRef = useRef(onSwipe);
  swipeRef.current = onSwipe;
  const padding = tabBarInset
    ? "px-5 pb-32 pt-2"
    : "px-5 pb-10 pt-2";
  const swipe = useMemo(() => {
    const native = Gesture.Native();
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX([-36, 36])
      .failOffsetY([-16, 16])
      .onEnd((event) => {
        if (!swipeRef.current || Math.abs(event.translationX) < 56) return;
        swipeRef.current(event.translationX < 0 ? "next" : "previous");
      });
    return Gesture.Simultaneous(pan, native);
  }, []);

  return (
    <SafeAreaView
      className="flex-1 bg-cove-ice"
      style={{ backgroundColor: colors.ice }}
      edges={["top"]}
    >
      {scroll ? (
        onSwipe ? (
          <GestureDetector gesture={swipe}>
            <GestureScrollView
              style={{ flex: 1 }}
              scrollEnabled={scrollEnabled}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingTop: 8,
                paddingBottom: tabBarInset ? 128 : 40,
              }}
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
            </GestureScrollView>
          </GestureDetector>
        ) : (
        <ScrollView
          className="flex-1"
          scrollEnabled={scrollEnabled}
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
        )
      ) : (
        <View className={`flex-1 ${padding}`}>{children}</View>
      )}
      {floating ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-28 items-center px-5"
        >
          {floating}
        </View>
      ) : null}
    </SafeAreaView>
  );
}
