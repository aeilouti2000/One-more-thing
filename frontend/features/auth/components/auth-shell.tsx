import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { router, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import {
  INTRO_MS,
  WelcomeShowcase,
  useIntroStyle,
} from "@/features/auth/components/welcome-showcase";
import { hexToHsl, hslToHex, withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * One persistent frame for Welcome, Log in, Sign up and Forgot password: a
 * glowing background with the brand on top and a rounded sheet underneath.
 * On Welcome the sheet only shows the sign-up buttons; on the other pages it
 * slides up to fill the screen and the brand shrinks into the top bar.
 */

const OPEN_MS = 480;
/** Ease-out-quint: a quick start that settles very softly. */
const OPEN_EASING = Easing.bezier(0.22, 1, 0.36, 1);
const BAR_HEIGHT = 44;
/** The drag handle strip at the top of the sheet (padding + bar). */
const HANDLE_HEIGHT = 20;
/** Gap between the top bar and the open sheet. */
const OPEN_GAP = 10;
/** How far (or how fast) a drag on the sheet handle must go to close it. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 900;

type AuthShellContextValue = {
  /** Welcome reports the height of its buttons so the sheet fits them. */
  setWelcomeHeight: (height: number) => void;
};

const AuthShellContext = createContext<AuthShellContextValue>({
  setWelcomeHeight: () => {},
});

export function useAuthShell() {
  return useContext(AuthShellContext);
}

const AUTH_PATHS = new Set(["/welcome", "/login", "/signup", "/forgot-password"]);

function leaveForm() {
  if (router.canGoBack()) router.back();
  else router.replace("/welcome");
}

/**
 * Background: the sheet's own surface color, with a soft hint of the accent
 * (blue by default) glowing in from the top.
 */
function useGlowColors() {
  const { colors, scheme } = useTheme();
  const { h, s } = hexToHsl(colors.accent);
  if (scheme === "dark") {
    return {
      gradient: [
        hslToHex(h, Math.min(s, 70) * 0.6, 24),
        hslToHex(h, Math.min(s, 70) * 0.45, 15),
        colors.ice,
        colors.ice,
      ] as const,
      text: colors.ink,
      muted: colors.muted,
    };
  }
  return {
    gradient: [
      hslToHex(h, Math.min(s, 90), 90),
      hslToHex(h, Math.min(s, 80), 94),
      colors.ice,
      colors.ice,
    ] as const,
    text: colors.ink,
    muted: colors.muted,
  };
}

export function AuthShell({ children }: { children: ReactNode }) {
  const { colors, scheme, setScheme } = useTheme();
  const { t, locale, setLocale, isRTL } = useI18n();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const dark = scheme === "dark";
  const glow = useGlowColors();
  // The root view sets direction: rtl for Arabic, so plain rows already
  // mirror; flipping again here would undo it.
  const row = "row" as const;

  // Only the auth routes move the sheet. A screen pushed on top (Privacy,
  // Terms) leaves the shell as it was underneath.
  const [authPath, setAuthPath] = useState(pathname);
  if (AUTH_PATHS.has(pathname) && pathname !== authPath) setAuthPath(pathname);
  const isWelcome = authPath === "/welcome";
  const [screenHeight, setScreenHeight] = useState(0);
  const [welcomeHeight, setWelcomeHeight] = useState(0);
  // The brand + feature tiles shrink to fit the space above the sheet.
  const [heroSlot, setHeroSlot] = useState(0);
  const [heroContent, setHeroContent] = useState(0);
  const heroScale =
    heroSlot > 0 && heroContent > 0 ? Math.min(1, heroSlot / heroContent) : 1;
  // The entrance waits until the sheet and the brand are measured.
  const heroReady = welcomeHeight > 0 && heroSlot > 0 && heroContent > 0;
  const intro = useSharedValue(0);
  useEffect(() => {
    if (heroReady && intro.get() === 0) {
      intro.set(withTiming(1, { duration: INTRO_MS, easing: Easing.linear }));
    }
  }, [heroReady, intro]);
  const logoIntro = useIntroStyle(intro, 0, true);
  const titleIntro = useIntroStyle(intro, 1);
  const taglineIntro = useIntroStyle(intro, 2);

  const barTop = insets.top + 6;
  const openTop = barTop + BAR_HEIGHT + OPEN_GAP;
  const welcomeTop =
    welcomeHeight > 0
      ? Math.max(openTop, screenHeight - welcomeHeight - HANDLE_HEIGHT)
      : screenHeight;
  // The sheet is always laid out open (just under the top bar). On Welcome
  // it's pushed down so only the buttons show. Moving it is purely a
  // transform on the UI thread, so a page change never jumps for a frame.
  const closedOffset = Math.max(0, welcomeTop - openTop);
  const targetOffset = isWelcome ? closedOffset : 0;

  // 0 = Welcome (big brand, short sheet), 1 = a form page (sheet open).
  const progress = useSharedValue(isWelcome ? 0 : 1);
  const offset = useSharedValue(10000);
  const drag = useSharedValue(0);
  const placed = useRef(false);

  useLayoutEffect(() => {
    if (screenHeight === 0) return;
    // Until Welcome has measured its buttons, keep the sheet off screen.
    if (isWelcome && welcomeHeight === 0) {
      offset.set(screenHeight);
      return;
    }
    const timing = { duration: OPEN_MS, easing: OPEN_EASING };
    if (!placed.current) {
      // First appearance: rise in from below the screen.
      placed.current = true;
      offset.set(screenHeight);
    }
    // Animate from wherever the sheet is drawn now (a released drag has
    // already been folded into `offset` on the UI thread).
    offset.set(withTiming(targetOffset, timing));
    progress.set(withTiming(isWelcome ? 0 : 1, timing));
  }, [
    drag,
    isWelcome,
    offset,
    progress,
    screenHeight,
    targetOffset,
    welcomeHeight,
  ]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value + drag.value }],
  }));
  const heroStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.6], [1, 0], "clamp"),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [0, -36]) },
      { scale: interpolate(progress.value, [0, 1], [1, 0.82]) },
    ],
  }));
  const miniStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.4, 1], [0, 1], "clamp"),
    transform: [{ translateY: interpolate(progress.value, [0, 1], [10, 0]) }],
  }));
  const backStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.3, 1], [0, 1], "clamp"),
  }));

  // Drag the handle down to close a form page (back to Welcome).
  const dismiss = Gesture.Pan()
    .enabled(!isWelcome)
    .activeOffsetY(8)
    .onUpdate((event) => {
      drag.set(Math.max(0, event.translationY));
    })
    .onEnd((event) => {
      if (
        event.translationY > DISMISS_DISTANCE ||
        event.velocityY > DISMISS_VELOCITY
      ) {
        // Keep the sheet exactly where the finger let go, then close.
        offset.set(offset.get() + drag.get());
        drag.set(0);
        runOnJS(leaveForm)();
      } else {
        drag.set(withSpring(0, { damping: 18, stiffness: 220 }));
      }
    });

  const reportWelcomeHeight = useCallback((height: number) => {
    setWelcomeHeight((current) =>
      Math.abs(current - height) < 1 ? current : height,
    );
  }, []);
  const context = useMemo(
    () => ({ setWelcomeHeight: reportWelcomeHeight }),
    [reportWelcomeHeight],
  );

  const sheetColor = colors.paper;
  const toolTint = dark
    ? withAlpha("#FFFFFF", 0.08)
    : withAlpha(colors.ink, 0.06);

  return (
    <AuthShellContext.Provider value={context}>
      <View
        style={styles.root}
        onLayout={(event) => setScreenHeight(event.nativeEvent.layout.height)}
      >
        <StatusBar style={dark ? "light" : "dark"} />
        <LinearGradient
          colors={glow.gradient}
          locations={[0, 0.32, 0.68, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Big brand, centered in the space above the Welcome sheet */}
        <Animated.View
          pointerEvents={isWelcome ? "box-none" : "none"}
          style={[
            styles.hero,
            {
              top: barTop + BAR_HEIGHT,
              height: Math.max(0, welcomeTop - barTop - BAR_HEIGHT),
            },
            heroStyle,
          ]}
        >
          <View
            style={styles.heroFit}
            onLayout={(event) => setHeroSlot(event.nativeEvent.layout.height)}
          >
            <View
              onLayout={(event) =>
                setHeroContent(event.nativeEvent.layout.height)
              }
              style={[
                styles.heroContent,
                heroScale < 1 ? { transform: [{ scale: heroScale }] } : null,
              ]}
            >
              <Animated.View
                style={[
                  logoIntro,
                  styles.logoGlow,
                  {
                    backgroundColor: withAlpha(
                      colors.accent,
                      dark ? 0.16 : 0.14,
                    ),
                  },
                ]}
              >
                <View
                  style={[
                    styles.logoShadow,
                    { shadowColor: dark ? "#000" : glow.text },
                  ]}
                >
                  <AppLogo size={64} />
                </View>
              </Animated.View>
              <Animated.View style={titleIntro}>
                <AppText
                  className="text-[22px] font-extrabold"
                  style={[styles.heroTitle, { color: glow.text }]}
                >
                  {t("appName")}
                </AppText>
              </Animated.View>
              <Animated.View style={taglineIntro}>
                <AppText
                  className="text-[13px]"
                  style={[styles.heroTagline, { color: glow.muted }]}
                >
                  {t("welcomeTagline")}
                </AppText>
              </Animated.View>
              <View style={styles.showcase}>
                <WelcomeShowcase
                  active={isWelcome && heroReady}
                  intro={intro}
                />
              </View>
            </View>
          </View>
        </Animated.View>

        {/* Top bar: back (form pages), small brand (form pages), theme + language */}
        <View style={[styles.bar, { top: barTop, flexDirection: row }]}>
          <Animated.View
            style={backStyle}
            pointerEvents={isWelcome ? "none" : "auto"}
          >
            <ToolButton
              icon={isRTL ? "chevron-forward" : "chevron-back"}
              label={t("back")}
              tint={toolTint}
              color={glow.text}
              onPress={leaveForm}
            />
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            style={[styles.mini, { flexDirection: row }, miniStyle]}
          >
            <AppLogo size={30} />
            <AppText
              numberOfLines={1}
              className="text-base font-bold"
              style={{ color: glow.text }}
            >
              {t("appName")}
            </AppText>
          </Animated.View>
          <View style={[styles.tools, { flexDirection: row }]}>
            <ToolButton
              icon={dark ? "sunny-outline" : "moon-outline"}
              label={t("appearance")}
              tint={toolTint}
              color={glow.text}
              onPress={() => setScheme(dark ? "light" : "dark")}
            />
            <ToolButton
              icon="language-outline"
              label={t("languageLabel")}
              tint={toolTint}
              color={glow.text}
              onPress={() => setLocale(locale === "ar" ? "en" : "ar")}
            />
          </View>
        </View>

        {/* The sheet: always full height; on Welcome it rests low */}
        <Animated.View
          pointerEvents="box-none"
          style={[StyleSheet.absoluteFill, sheetStyle]}
        >
          <View
            style={[
              styles.sheet,
              {
                top: openTop,
                height: Math.max(0, screenHeight - openTop),
                backgroundColor: sheetColor,
                borderColor: dark
                  ? withAlpha("#FFFFFF", 0.08)
                  : withAlpha(colors.ink, 0.06),
                shadowColor: dark ? "#000" : glow.text,
                shadowOpacity: dark ? 0.45 : 0.08,
              },
            ]}
          >
            <GestureDetector gesture={dismiss}>
              <View style={styles.handleArea}>
                <View
                  style={[
                    styles.handle,
                    {
                      backgroundColor: withAlpha(
                        colors.muted,
                        dark ? 0.35 : 0.3,
                      ),
                    },
                  ]}
                />
              </View>
            </GestureDetector>
            <View style={styles.flex}>{children}</View>
          </View>
        </Animated.View>
      </View>
    </AuthShellContext.Provider>
  );
}

function ToolButton({
  icon,
  label,
  tint,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tint: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      className="active:opacity-70"
    >
      <View style={[styles.tool, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
    </Pressable>
  );
}

/** Scrollable page content inside the open sheet (Log in, Sign up, …). */
export function AuthSheetPage({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const keyboardHeight = useAndroidKeyboardLift();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrollY = useRef(0);

  // Android draws edge to edge, so the window doesn't shrink for the keyboard.
  // Pad the page by the keyboard and scroll the focused field above it.
  useEffect(() => {
    if (keyboardHeight === 0) return;
    const field = TextInput.State.currentlyFocusedInput();
    if (!field) return;
    const frame = requestAnimationFrame(() => {
      field.measureInWindow((_x, y, _width, height) => {
        const visibleBottom = Dimensions.get("window").height - keyboardHeight - 24;
        const overlap = y + height - visibleBottom;
        if (overlap > 0) {
          scrollRef.current?.scrollTo({ y: scrollY.current + overlap, animated: true });
        }
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardHeight]);

  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(120)}
      style={styles.flex}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={(event) => {
            scrollY.current = event.nativeEvent.contentOffset.y;
          }}
          contentContainerStyle={[
            styles.page,
            { paddingBottom: Math.max(insets.bottom, 16) + 12 + keyboardHeight },
          ]}
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

/** Keyboard height on Android (0 elsewhere: iOS uses KeyboardAvoidingView). */
function useAndroidKeyboardLift() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** Title + subtitle at the top of a sheet page. */
export function AuthSheetHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const { colors } = useTheme();
  // Natural alignment: the root view's RTL direction already puts it on the
  // reading side; an explicit "right" would be mirrored to the left.
  const textAlign = "auto" as const;
  return (
    <View style={styles.heading}>
      <AppText
        style={{
          color: colors.ink,
          fontWeight: "700",
          fontSize: 26,
          lineHeight: 32,
          textAlign,
        }}
      >
        {title}
      </AppText>
      <AppText
        style={{
          marginTop: 4,
          color: colors.muted,
          fontSize: 14,
          lineHeight: 20,
          textAlign,
        }}
      >
        {subtitle}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: "hidden",
  },
  flex: {
    flex: 1,
  },
  hero: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  heroFit: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 14,
  },
  heroContent: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  logoGlow: {
    padding: 8,
    borderRadius: 48,
  },
  logoShadow: {
    borderRadius: 32,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  heroTitle: {
    marginTop: 10,
    letterSpacing: -0.4,
    textAlign: "center",
  },
  heroTagline: {
    marginTop: 2,
    textAlign: "center",
  },
  showcase: {
    width: "100%",
    marginTop: 14,
  },
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    height: BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 2,
  },
  mini: {
    position: "absolute",
    // Clear of the back button (start) and the two tool buttons (end).
    start: 56,
    end: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  tools: {
    gap: 8,
  },
  tool: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    borderRightWidth: StyleSheet.hairlineWidth * 2,
    overflow: "hidden",
    shadowOffset: { width: 0, height: -10 },
    shadowRadius: 24,
    elevation: 16,
  },
  handleArea: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  page: {
    flexGrow: 1,
    paddingHorizontal: 22,
    paddingTop: 8,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  heading: {
    marginBottom: 22,
  },
});
