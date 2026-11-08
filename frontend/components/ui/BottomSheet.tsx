import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import {
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import {
  GestureDetector,
  GestureHandlerRootView,
  usePanGesture,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurBackdrop } from "@/components/ui/BlurBackdrop";
import { withAlpha } from "@/constants/theme";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useTheme } from "@/providers/ThemeProvider";

const OPEN_MS = 300;
const CLOSE_MS = 220;
const SHEET_RADIUS = 28;
/** Drag past this (or flick faster than DISMISS_VELOCITY) to close. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
/** Sheets cap their width on tablets / unfolded phones. */
const WIDE_MAX_WIDTH = 560;

type SheetScroll = {
  scrollToEnd: () => void;
  scrollToStart: () => void;
};

const SheetScrollContext = createContext<SheetScroll | null>(null);
const InSheetContext = createContext(false);

/** Scroll helpers for content inside a sheet (e.g. reveal fields above the keyboard). */
export function useSheetScroll() {
  return useContext(SheetScrollContext);
}

/** True when rendered inside a BottomSheet — cards drop their floating chrome. */
export function useInSheet() {
  return useContext(InSheetContext);
}

export type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  onShow?: () => void;
  /** Hide without closing, so a camera or photo picker can present. */
  covered?: boolean;
  /** Block backdrop / drag / back dismissal (e.g. while saving). */
  locked?: boolean;
  children: ReactNode;
};

export function BottomSheet({
  visible,
  onClose,
  onShow,
  covered = false,
  locked = false,
  children,
}: BottomSheetProps) {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWideLayout();
  const { height: windowHeight } = useWindowDimensions();
  const dark = scheme === "dark";

  // Stay mounted through the close animation.
  const [mounted, setMounted] = useState(visible);
  const [trackedVisible, setTrackedVisible] = useState(visible);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // The native modal fires onShow again when it comes back from `covered`
  // (e.g. after the photo picker); callers only want it once per opening.
  const [shownOnce, setShownOnce] = useState(false);
  if (visible !== trackedVisible) {
    setTrackedVisible(visible);
    if (visible) setMounted(true);
    else {
      setKeyboardHeight(0);
      setShownOnce(false);
    }
  }

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetHeight = useSharedValue(windowHeight);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const lockedRef = useRef(locked);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    lockedRef.current = locked;
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      drag.set(0);
      progress.set(
        withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }),
      );
      return;
    }
    progress.set(
      withTiming(
        0,
        { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      ),
    );
  }, [drag, mounted, progress, visible]);

  useEffect(() => {
    if (!visible) return;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  const scrollToEnd = useCallback(() => {
    const run = () => scrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(run);
    setTimeout(run, 150);
  }, []);
  const scrollToStart = useCallback(() => {
    const run = () => scrollRef.current?.scrollTo({ y: 0, animated: true });
    requestAnimationFrame(run);
    setTimeout(run, 150);
  }, []);
  const scroll = useMemo(
    () => ({ scrollToEnd, scrollToStart }),
    [scrollToEnd, scrollToStart],
  );

  function requestClose() {
    if (lockedRef.current) return;
    Keyboard.dismiss();
    onCloseRef.current();
  }

  function backPressed() {
    if (Keyboard.isVisible() || keyboardHeight > 0) {
      Keyboard.dismiss();
      return;
    }
    requestClose();
  }

  const pan = usePanGesture({
    activeOffsetY: [-8, 8],
    onUpdate: (event) => {
      drag.set(Math.max(0, event.translationY));
    },
    onDeactivate: (event) => {
      const shouldClose =
        event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY;
      if (shouldClose) {
        runOnJS(requestClose)();
      }
      // Spring back; if closing, the visible=false animation takes over.
      drag.set(withSpring(0, { damping: 22, stiffness: 260 }));
    },
  });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - progress.value) * sheetHeight.value + drag.value },
    ],
  }));

  if (!mounted) return null;

  const keyboardOpen = keyboardHeight > 0;
  const surface = dark ? colors.paper : colors.white;
  const edge = dark ? withAlpha(colors.white, 0.1) : withAlpha("#12141A", 0.08);

  return (
    <Modal
      visible={!covered}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onShow={() => {
        if (shownOnce) return;
        setShownOnce(true);
        onShow?.();
      }}
      onRequestClose={backPressed}
    >
      <GestureHandlerRootView style={styles.fill}>
        <View style={[styles.fill, { paddingBottom: keyboardHeight }]}>
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <BlurBackdrop onPress={requestClose} disabled={locked} />
          </Animated.View>

          <View pointerEvents="box-none" style={styles.dock}>
            <Animated.View
              onLayout={(event) => sheetHeight.set(event.nativeEvent.layout.height)}
              style={[
                styles.sheet,
                {
                  backgroundColor: surface,
                  borderColor: edge,
                  maxHeight: windowHeight - insets.top - 12 - keyboardHeight,
                },
                wide ? styles.sheetWide : null,
                sheetStyle,
              ]}
            >
              <GestureDetector gesture={pan}>
                <View
                  style={styles.grabZone}
                  accessibilityRole="adjustable"
                  accessibilityLabel="Drag down to close"
                >
                  <View
                    style={[
                      styles.grabber,
                      { backgroundColor: withAlpha(colors.muted, dark ? 0.55 : 0.4) },
                    ]}
                  />
                </View>
              </GestureDetector>

              <InSheetContext.Provider value>
                <SheetScrollContext.Provider value={scroll}>
                  <ScrollView
                    ref={scrollRef}
                    style={styles.scroll}
                    contentContainerStyle={{
                      paddingHorizontal: 20,
                      paddingBottom: keyboardOpen ? 16 : insets.bottom + 20,
                    }}
                    keyboardShouldPersistTaps="handled"
                    keyboardDismissMode="on-drag"
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    overScrollMode="never"
                  >
                    {children}
                  </ScrollView>
                </SheetScrollContext.Provider>
              </InSheetContext.Provider>
            </Animated.View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dock: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    width: "100%",
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 24,
  },
  sheetWide: {
    maxWidth: WIDE_MAX_WIDTH,
    alignSelf: "center",
  },
  grabZone: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 14,
  },
  grabber: {
    width: 40,
    height: 5,
    borderRadius: 3,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
});
