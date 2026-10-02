import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { Dimensions, RefreshControl, ScrollView, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView as GestureScrollView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { TabBlurSurface } from "@/components/ui/TabBlurTarget";
import { spacing } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 650;
const SWIPE_ACTIVE_X = 24;
const SWIPE_FAIL_Y = 18;
const SLIDE_OUT_MS = 160;
const SLIDE_IN_MS = 220;
const screenWidth = Dimensions.get("window").width;

type SwipeDirection = "next" | "previous";

type ScreenSwipeContextValue = {
  translateX: SharedValue<number>;
};

const ScreenSwipeContext = createContext<ScreenSwipeContextValue | null>(null);

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
  onSwipe?: (direction: SwipeDirection) => void;
  canSwipe?: (direction: SwipeDirection) => boolean;
};

export function SwipeSlideContent({ children }: { children: ReactNode }) {
  const swipe = useContext(ScreenSwipeContext);
  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipe?.translateX.value ?? 0 }],
  }));

  if (!swipe) {
    return <>{children}</>;
  }

  return (
    <View style={{ overflow: "hidden", width: "100%" }}>
      <Animated.View needsOffscreenAlphaCompositing style={slideStyle}>
        {children}
      </Animated.View>
    </View>
  );
}

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
  canSwipe,
}: ScreenProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const dockBottom = Math.max(insets.bottom, spacing.md) + spacing.sm;
  const swipeRef = useRef(onSwipe);
  const canSwipeRef = useRef(canSwipe);
  const commitSwipeRef = useRef<(direction: SwipeDirection) => void>(() => {});
  const rejectSwipeRef = useRef<() => void>(() => {});
  const translateX = useSharedValue(0);
  const isAnimating = useSharedValue(false);
  const canNext = useSharedValue(1);
  const canPrev = useSharedValue(1);
  const headerSurface = scheme === "dark" ? colors.deep : colors.accent;
  const padding = tabBarInset
    ? top
      ? "px-5 pb-32 pt-4"
      : "px-5 pb-32 pt-2"
    : top
      ? "px-5 pb-10 pt-4"
      : "px-5 pb-10 pt-2";

  // Stable context identity — avoid re-renders from inline onSwipe props.
  const swipeContext = useMemo(
    (): ScreenSwipeContextValue => ({ translateX }),
    [translateX],
  );

  useEffect(() => {
    swipeRef.current = onSwipe;
  }, [onSwipe]);

  useEffect(() => {
    canSwipeRef.current = canSwipe;
    canNext.set(canSwipe?.("next") === false ? 0 : 1);
    canPrev.set(canSwipe?.("previous") === false ? 0 : 1);
  }, [canNext, canPrev, canSwipe]);

  const startEnter = useCallback(() => {
    translateX.set(
      withTiming(0, {
        duration: SLIDE_IN_MS,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished) {
          isAnimating.set(false);
        }
      }),
    );
  }, [isAnimating, translateX]);

  const commitSwipe = useCallback(
    (direction: SwipeDirection) => {
      const enterX = direction === "next" ? screenWidth : -screenWidth;
      // Park off-screen opposite the exit, swap list content, then enter.
      translateX.set(enterX);
      swipeRef.current?.(direction);
      // Double rAF waits for React to commit/paint the new list while off-screen.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          startEnter();
        });
      });
    },
    [startEnter, translateX],
  );

  const rejectSwipe = useCallback(() => {
    translateX.set(
      withTiming(0, {
        duration: 180,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished) {
          isAnimating.set(false);
        }
      }),
    );
  }, [isAnimating, translateX]);

  useEffect(() => {
    commitSwipeRef.current = commitSwipe;
    rejectSwipeRef.current = rejectSwipe;
  }, [commitSwipe, rejectSwipe]);

  function callCommitSwipe(direction: SwipeDirection) {
    commitSwipeRef.current(direction);
  }

  function callRejectSwipe() {
    rejectSwipeRef.current();
  }

  /* eslint-disable react-hooks/refs -- gesture callback reads latest handlers via refs */
  const swipe = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pan()
          .activeOffsetX([-SWIPE_ACTIVE_X, SWIPE_ACTIVE_X])
          .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
          .onUpdate((event) => {
            "worklet";
            if (isAnimating.value) return;
            translateX.set(event.translationX);
          })
          .onEnd((event) => {
            "worklet";
            if (isAnimating.value) return;

            const distance = Math.abs(event.translationX);
            const velocity = Math.abs(event.velocityX);
            const passed =
              distance >= SWIPE_DISTANCE || velocity >= SWIPE_VELOCITY;

            if (!passed) {
              translateX.set(
                withTiming(0, {
                  duration: 180,
                  easing: Easing.out(Easing.cubic),
                }),
              );
              return;
            }

            const direction: SwipeDirection =
              event.translationX < 0 ? "next" : "previous";
            const allowed =
              direction === "next" ? canNext.value : canPrev.value;

            if (!allowed) {
              runOnJS(callRejectSwipe)();
              return;
            }

            isAnimating.set(true);
            const exitX = direction === "next" ? -screenWidth : screenWidth;
            // Finish exit on the UI thread — only hop to JS to swap content.
            translateX.set(
              withTiming(
                exitX,
                {
                  duration: SLIDE_OUT_MS,
                  easing: Easing.in(Easing.cubic),
                },
                (finished) => {
                  if (!finished) {
                    isAnimating.set(false);
                    return;
                  }
                  runOnJS(callCommitSwipe)(direction);
                },
              ),
            );
          })
          .onFinalize((_, success) => {
            "worklet";
            if (!success && !isAnimating.value) {
              translateX.set(
                withTiming(0, {
                  duration: 180,
                  easing: Easing.out(Easing.cubic),
                }),
              );
            }
          }),
        Gesture.Native(),
      ),
    // Shared values + refs stay valid for the gesture lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  /* eslint-enable react-hooks/refs */

  const scrollContent = onSwipe ? (
    <ScreenSwipeContext.Provider value={swipeContext}>
      {children}
    </ScreenSwipeContext.Provider>
  ) : (
    children
  );

  const swipeBody = (
    <View style={{ flex: 1, width: "100%" }}>
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
          {scrollContent}
        </GestureScrollView>
      </GestureDetector>
    </View>
  );

  const body = (
    <SafeAreaView
      className="flex-1 bg-cove-ice"
      style={{ backgroundColor: colors.ice }}
      edges={top ? [] : ["top"]}
    >
      {top ? (
        <View style={{ zIndex: 2, paddingTop: insets.top }}>
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: insets.top,
              backgroundColor: headerSurface,
            }}
          />
          {top}
        </View>
      ) : null}
      {scroll ? (
        onSwipe ? (
          swipeBody
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
