import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Dimensions,
  Platform,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import {
  GestureDetector,
  usePanGesture,
  type PanGesture,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassBackdrop } from "@/components/ui/GlassBackdrop";
import { TabBlurSurface } from "@/components/ui/TabBlurTarget";
import { spacing, tabBar } from "@/constants/theme";
import { SETTINGS_MASTER_WIDTH } from "@/lib/layout";
import { isMotionOff, motionOffOnUI } from "@/lib/motion";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const SWIPE_DISTANCE = 48;
const SWIPE_VELOCITY = 650;
const SWIPE_ACTIVE_X = 24;
const SWIPE_FAIL_Y = 18;
const SLIDE_IN_MS = 220;
const screenWidth = Dimensions.get("window").width;

type SwipeDirection = "next" | "previous";

type ScreenSwipeContextValue = {
  translateX: SharedValue<number>;
  /** Opacity of the sliding content; below 1 only during a tab-button switch. */
  fade: SharedValue<number>;
};

/** A tab-button switch: the page drifts this far while it fades, not a full slide. */
const SOFT_SHIFT = 44;
const SOFT_OUT_MS = 130;
const SOFT_IN_MS = 260;

const ScreenSwipeContext = createContext<ScreenSwipeContextValue | null>(null);
const ScreenSwipeGestureContext = createContext<PanGesture | null>(null);

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  scrollEnabled?: boolean;
  tabBarInset?: boolean;
  /** Keep content below the status bar. Off by default so ScreenHeader can cover it. */
  safeTop?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  floating?: ReactNode;
  top?: ReactNode;
  dock?: ReactNode;
  /** Full-screen overlay layer for a floating action button (positions itself). */
  fab?: ReactNode;
  /**
   * Full-screen layer above the page and outside its blur target, so glass in
   * it can blur the page. It positions itself and does not move `floating`.
   */
  overlay?: ReactNode;
  /** Kept at the page's scroll offset (plain scrolling pages only). */
  scrollY?: SharedValue<number>;
  /** Place the dock in the gap beside the centered fold tab bar. */
  dockBeside?: boolean;
  onSwipe?: (direction: SwipeDirection) => void;
  canSwipe?: (direction: SwipeDirection) => boolean;
  /**
   * Filled with a function that plays the swipe (slide out, onSwipe, slide in)
   * without a finger, e.g. from a tab button. It returns false when it can't
   * run (already moving, or canSwipe says no), so the caller can switch plainly.
   */
  slideRef?: RefObject<((direction: SwipeDirection) => boolean) | null>;
};

export function useScreenSwipeGesture() {
  return useContext(ScreenSwipeGestureContext);
}

export function SwipeSlideContent({ children }: { children: ReactNode }) {
  const swipe = useContext(ScreenSwipeContext);
  const translateX = swipe?.translateX;
  const fade = swipe?.fade;
  const slideStyle = useAnimatedStyle(() => ({
    opacity: fade?.value ?? 1,
    transform: [{ translateX: translateX?.value ?? 0 }],
  }));

  if (!translateX) {
    return <>{children}</>;
  }

  return (
    <View style={{ overflow: "hidden", alignSelf: "stretch" }}>
      <Animated.View
        needsOffscreenAlphaCompositing
        style={[{ width: "100%" }, slideStyle]}
      >
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
  safeTop = false,
  refreshing = false,
  onRefresh,
  floating,
  top,
  dock,
  fab,
  overlay: overlayLayer,
  scrollY,
  dockBeside = false,
  onSwipe,
  canSwipe,
  slideRef,
}: ScreenProps) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // Same bottom as GlassTabBar. On fold settings the dock sits beside the bar.
  const dockBottom = Math.max(insets.bottom, spacing.md) + spacing.sm;
  const dockBesideTabBar = Boolean(dockBeside && dock);
  // A bottom-docked card (not beside the tab bar) pushes floating toasts above it.
  const [dockHeight, setDockHeight] = useState(0);
  const floatingAboveDock =
    dock && !dockBesideTabBar && dockHeight > 0
      ? { bottom: dockBottom + dockHeight + spacing.md }
      : null;
  const swipeRef = useRef(onSwipe);
  const canSwipeRef = useRef(canSwipe);
  const commitSwipeRef = useRef<(direction: SwipeDirection, soft?: boolean) => void>(() => {});
  const rejectSwipeRef = useRef<() => void>(() => {});
  const translateX = useSharedValue(0);
  const fade = useSharedValue(1);
  const isAnimating = useSharedValue(false);
  const trackScroll = useAnimatedScrollHandler((event) => {
    scrollY?.set(event.contentOffset.y);
  });
  const canNext = useSharedValue(1);
  const canPrev = useSharedValue(1);
  const bottomPad = tabBarInset ? (fab ? "pb-40" : "pb-32") : "pb-10";
  const padding = top
    ? `px-4 ${bottomPad} pt-4`
    : `px-4 ${bottomPad} pt-2`;

  const sideInset = spacing.xl;
  const tabShellWidth = Math.min(
    tabBar.maxWidth,
    Math.max(0, windowWidth - sideInset * 2),
  );
  const tabBarLeft = (windowWidth - tabShellWidth) / 2;
  const tabBarRight = tabBarLeft + tabShellWidth;
  const dockGap = spacing.sm;
  // Screen is the settings detail pane on fold — convert window coords to local.
  const dockBesideStyle = dockBesideTabBar
    ? isRTL
      ? {
          left: sideInset,
          right: Math.max(
            spacing.screen,
            windowWidth -
              SETTINGS_MASTER_WIDTH -
              (tabBarLeft - dockGap),
          ),
        }
      : {
          left: Math.max(
            spacing.screen,
            tabBarRight + dockGap - SETTINGS_MASTER_WIDTH,
          ),
          right: sideInset,
        }
    : null;
  useEffect(() => {
    swipeRef.current = onSwipe;
  }, [onSwipe]);

  useEffect(() => {
    canSwipeRef.current = canSwipe;
    canNext.set(canSwipe?.("next") === false ? 0 : 1);
    canPrev.set(canSwipe?.("previous") === false ? 0 : 1);
  }, [canNext, canPrev, canSwipe]);

  const startEnter = useCallback((soft = false) => {
    const duration = soft ? SOFT_IN_MS : SLIDE_IN_MS;
    fade.set(withTiming(1, { duration, easing: Easing.out(Easing.quad) }));
    translateX.set(
      withTiming(0, {
        duration,
        easing: Easing.out(Easing.cubic),
      }, (finished) => {
        if (finished) {
          isAnimating.set(false);
        }
      }),
    );
  }, [fade, isAnimating, translateX]);

  const commitSwipe = useCallback(
    (direction: SwipeDirection, soft = false) => {
      const distance = soft ? SOFT_SHIFT : screenWidth;
      const enterX = direction === "next" ? distance : -distance;
      // Park off-screen opposite the exit, swap list content, then enter.
      translateX.set(enterX);
      swipeRef.current?.(direction);
      // Double rAF waits for React to commit/paint the new list while off-screen.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          startEnter(soft);
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

  function callRejectSwipe() {
    rejectSwipeRef.current();
  }

  function callCommitSoft(direction: SwipeDirection) {
    commitSwipeRef.current(direction, true);
  }

  /**
   * Animations off: the new view simply replaces the old one. Fading out
   * first would leave the page empty for a few frames, which reads as a fade.
   */
  function swapNow(direction: SwipeDirection) {
    swipeRef.current?.(direction);
  }

  useEffect(() => {
    if (!slideRef) return;
    slideRef.current = (direction) => {
      if (!swipeRef.current || isAnimating.get()) return false;
      if (canSwipeRef.current?.(direction) === false) return false;
      if (isMotionOff()) {
        swapNow(direction);
        return true;
      }
      isAnimating.set(true);
      // Fade through with a short drift: the old view leaves, the new one
      // arrives from the other side. Nothing crosses the whole screen, so it
      // reads as one calm motion even while the new list is being drawn.
      const exitX = direction === "next" ? -SOFT_SHIFT : SOFT_SHIFT;
      fade.set(withTiming(0, { duration: SOFT_OUT_MS, easing: Easing.in(Easing.quad) }));
      translateX.set(
        withTiming(
          exitX,
          { duration: SOFT_OUT_MS, easing: Easing.in(Easing.quad) },
          (finished) => {
            if (!finished) {
              fade.set(1);
              isAnimating.set(false);
              return;
            }
            runOnJS(callCommitSoft)(direction);
          },
        ),
      );
      return true;
    };
    return () => {
      slideRef.current = null;
    };
  });

  const listPan = usePanGesture({
    enabled: Boolean(onSwipe),
    activeOffsetX: [-SWIPE_ACTIVE_X, SWIPE_ACTIVE_X],
    failOffsetY: [-SWIPE_FAIL_Y, SWIPE_FAIL_Y],
    onUpdate: (event) => {
      // Animations off: the page stays put under the finger and swaps on release.
      if (isAnimating.value || motionOffOnUI.value) return;
      const goingNext = event.translationX < 0;
      const allowed = goingNext ? canNext.value === 1 : canPrev.value === 1;
      translateX.set(allowed ? event.translationX : 0);
    },
    onDeactivate: (event) => {
      if (isAnimating.value || event.canceled) return;

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
      const allowed = direction === "next" ? canNext.value : canPrev.value;

      if (!allowed) {
        runOnJS(callRejectSwipe)();
        return;
      }

      if (motionOffOnUI.value) {
        translateX.set(0);
        runOnJS(swapNow)(direction);
        return;
      }

      isAnimating.set(true);
      // Same ending as the tab button: from wherever the finger let go, the
      // page drifts a little further and fades; the new one fades in.
      const exitX = event.translationX + (direction === "next" ? -SOFT_SHIFT : SOFT_SHIFT);
      fade.set(withTiming(0, { duration: SOFT_OUT_MS, easing: Easing.out(Easing.quad) }));
      translateX.set(
        withTiming(
          exitX,
          {
            duration: SOFT_OUT_MS,
            easing: Easing.out(Easing.quad),
          },
          (finished) => {
            if (!finished) {
              fade.set(1);
              isAnimating.set(false);
              return;
            }
            runOnJS(callCommitSoft)(direction);
          },
        ),
      );
    },
    onFinalize: (event) => {
      if (event.canceled && !isAnimating.value) {
        translateX.set(
          withTiming(0, {
            duration: 180,
            easing: Easing.out(Easing.cubic),
          }),
        );
      }
    },
  });

  // Stable context identity — avoid re-renders from inline onSwipe props.
  const swipeContext = useMemo(
    (): ScreenSwipeContextValue => ({ translateX, fade }),
    [fade, translateX],
  );

  // Android 0.85+ defaults nested scrolling on, which can leave the refresh
  // spinner on screen after the pull ends.
  const nestedScrollEnabled = Platform.OS === "android" ? false : undefined;
  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accentText}
      colors={[colors.accentText]}
      progressBackgroundColor={scheme === "dark" ? colors.deep : colors.white}
    />
  ) : undefined;

  const scrollContent = onSwipe ? (
    <ScreenSwipeContext.Provider value={swipeContext}>
      <ScreenSwipeGestureContext.Provider value={listPan}>
        {children}
      </ScreenSwipeGestureContext.Provider>
    </ScreenSwipeContext.Provider>
  ) : (
    children
  );

  const swipeBody = (
    <View style={{ flex: 1, width: "100%" }}>
      {/* A plain ScrollView, not gesture-handler's: when a text field's
          long-press asks parents to let go of the touch, the gesture-handler
          scroll view cancels the touch and selection never opens.
          enableContextMenu keeps the browser's copy/paste menu on web. */}
      <GestureDetector gesture={listPan} enableContextMenu>
        <ScrollView
          style={{ flex: 1, width: "100%" }}
          scrollEnabled={scrollEnabled}
          removeClippedSubviews={false}
          contentContainerStyle={{
            width: "100%",
            paddingHorizontal: spacing.screen,
            paddingTop: top ? spacing.lg : spacing.sm,
            paddingBottom: tabBarInset ? (fab ? 160 : 128) : 40,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={nestedScrollEnabled}
          refreshControl={refreshControl}
        >
          {scrollContent}
        </ScrollView>
      </GestureDetector>
    </View>
  );

  const body = (
    <SafeAreaView
      className="flex-1 bg-cove-ice"
      style={{ backgroundColor: colors.ice }}
      edges={safeTop && !top ? ["top"] : []}
    >
      <GlassBackdrop />
      {top ? <View style={{ zIndex: 2 }}>{top}</View> : null}
      {scroll ? (
        onSwipe ? (
          swipeBody
        ) : scrollY ? (
          <Animated.ScrollView
            style={{ flex: 1 }}
            scrollEnabled={scrollEnabled}
            removeClippedSubviews={false}
            contentContainerStyle={{
              paddingHorizontal: spacing.screen,
              paddingTop: top ? spacing.lg : spacing.sm,
              paddingBottom: tabBarInset ? (fab ? 160 : 128) : 40,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={nestedScrollEnabled}
            refreshControl={refreshControl}
            onScroll={trackScroll}
            scrollEventThrottle={16}
          >
            {children}
          </Animated.ScrollView>
        ) : (
        <ScrollView
          className="flex-1"
          scrollEnabled={scrollEnabled}
          removeClippedSubviews={false}
          contentContainerClassName={padding}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          nestedScrollEnabled={nestedScrollEnabled}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.accentText}
                colors={[colors.accentText]}
                progressBackgroundColor={scheme === "dark" ? colors.deep : colors.white}
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
      {overlayLayer}
      {floating ? (
        <View
          pointerEvents="box-none"
          className={`absolute inset-x-0 ${fab ? "bottom-40" : "bottom-28"} items-center px-4`}
          style={floatingAboveDock}
        >
          {floating}
        </View>
      ) : null}
      {fab}
      {dock ? (
        <View
          pointerEvents="box-none"
          className={dockBesideTabBar ? "absolute" : "absolute inset-x-4"}
          onLayout={(event) => setDockHeight(event.nativeEvent.layout.height)}
          style={[
            { bottom: dockBottom, zIndex: 30 },
            dockBesideStyle,
            dockBesideTabBar ? { height: tabBar.height } : null,
          ]}
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
