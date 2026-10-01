import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView as GestureScrollView,
} from "react-native-gesture-handler";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBlurSurface } from "@/components/ui/TabBlurTarget";
import { spacing } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  scrollEnabled?: boolean;
  tabBarInset?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  floating?: ReactNode;
  top?: ReactNode;
  dock?: ReactNode;
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
  top,
  dock,
  onSwipe,
}: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, spacing.md) + spacing.sm;
  const swipeRef = useRef(onSwipe);
  const padding = tabBarInset
    ? top
      ? "px-5 pb-32 pt-4"
      : "px-5 pb-32 pt-2"
    : top
      ? "px-5 pb-10 pt-4"
      : "px-5 pb-10 pt-2";

  useEffect(() => {
    swipeRef.current = onSwipe;
  }, [onSwipe]);

  /* eslint-disable react-hooks/refs -- gesture callback reads latest onSwipe via ref */
  const swipe = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pan()
          .runOnJS(true)
          .activeOffsetX([-36, 36])
          .failOffsetY([-16, 16])
          .onEnd((event) => {
            const handler = swipeRef.current;
            if (!handler || Math.abs(event.translationX) < 56) return;
            handler(event.translationX < 0 ? "next" : "previous");
          }),
        Gesture.Native(),
      ),
    [],
  );
  /* eslint-enable react-hooks/refs */

  const body = (
    <SafeAreaView
      className="flex-1 bg-cove-ice"
      style={{ backgroundColor: colors.ice }}
      edges={["top"]}
    >
      {top ? (
        <View style={{ backgroundColor: colors.ice, zIndex: 2 }}>{top}</View>
      ) : null}
      {scroll ? (
        onSwipe ? (
          <GestureDetector gesture={swipe}>
            <GestureScrollView
              style={{ flex: 1, width: "100%" }}
              scrollEnabled={scrollEnabled}
              removeClippedSubviews={false}
              contentContainerStyle={{
                paddingHorizontal: spacing.screen,
                paddingTop: top ? spacing.lg : spacing.sm,
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
          removeClippedSubviews={false}
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
    </SafeAreaView>
  );

  const overlay = (
    <>
      {floating ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-0 bottom-28 items-center px-5"
        >
          {floating}
        </View>
      ) : null}
      {dock ? (
        <View
          pointerEvents="box-none"
          className="absolute inset-x-5"
          style={{ bottom: dockBottom, zIndex: 30 }}
        >
          {dock}
        </View>
      ) : null}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <TabBlurSurface>{body}</TabBlurSurface>
      {overlay}
    </View>
  );
}
