import { useEffect, useRef, useState, type ReactNode } from "react";
import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeInLeft,
  FadeInRight,
  FadeOutLeft,
  FadeOutRight,
  ZoomIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { withAlpha } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * Welcome's feature card: one card that plays the app's three main features
 * in turn — synced list, shopping trip, trip costs — each with a short
 * animated story. Story bars on top show which one is playing; a swipe skips
 * ahead or back. All motion runs on Reanimated's UI thread.
 */

const LIVE = "#5FD08A";
const AMBER = "#FFB020";
const PARTNER = "#E0A64A";
const TRIP_BLUE = "#5AAEFF";

/** How long each feature stays on the card. */
const SCENE_MS = 4400;
const SCENES = 3;
const TYPE_MS = 70;
const SMOOTH = { duration: 520, easing: Easing.out(Easing.cubic) };
/** Fixed body height so switching features never resizes the card. */
const BODY_HEIGHT = 156;

/**
 * One shared intro clock (0 → 1) drives the whole Welcome entrance, so every
 * piece appears in a smooth stagger that starts only once the layout has
 * been measured — nothing pops or resizes mid-animation.
 */
export const INTRO_MS = 1100;
const INTRO_STEP = 0.1;
const INTRO_SPAN = 0.5;

export function useIntroStyle(
  intro: SharedValue<number>,
  index: number,
  zoom = false,
) {
  return useAnimatedStyle(() => {
    const start = index * INTRO_STEP;
    const t = Math.min(1, Math.max(0, (intro.value - start) / INTRO_SPAN));
    const eased = 1 - Math.pow(1 - t, 3);
    return {
      opacity: eased,
      transform: zoom
        ? [{ scale: 0.86 + 0.14 * eased }]
        : [{ translateY: (1 - eased) * 14 }],
    };
  });
}

/** Runs `steps` (ms → fn) once per mount; cleared on unmount. */
function useTimeline(steps: [number, () => void][]) {
  const ref = useRef(steps);
  useEffect(() => {
    const timers = ref.current.map(([ms, fn]) => setTimeout(fn, ms));
    return () => timers.forEach(clearTimeout);
  }, []);
}

export function WelcomeShowcase({
  active,
  intro,
}: {
  active: boolean;
  intro: SharedValue<number>;
}) {
  const { colors, scheme } = useTheme();
  const { isRTL } = useI18n();
  const dark = scheme === "dark";
  const [scene, setScene] = useState(0);
  // +1 = moving forward (new content comes from the end side), -1 = back.
  const [direction, setDirection] = useState(1);
  const progress = useSharedValue(0);
  const cardIntro = useIntroStyle(intro, 3);

  // Advance on a timer while Welcome is showing; the story bar fills along.
  useEffect(() => {
    if (!active) return;
    progress.set(0);
    progress.set(withTiming(1, { duration: SCENE_MS, easing: Easing.linear }));
    const timer = setTimeout(() => {
      setDirection(1);
      setScene((current) => (current + 1) % SCENES);
    }, SCENE_MS);
    return () => clearTimeout(timer);
  }, [active, progress, scene]);

  const go = (step: number) => {
    setDirection(step);
    setScene((current) => (current + step + SCENES) % SCENES);
  };

  // Swipe toward the start edge for the next feature (mirrored in Arabic).
  const swipe = Gesture.Pan()
    .activeOffsetX([-16, 16])
    .failOffsetY([-12, 12])
    .onEnd((event) => {
      if (Math.abs(event.translationX) < 40) return;
      const towardStart = isRTL
        ? event.translationX > 0
        : event.translationX < 0;
      runOnJS(go)(towardStart ? 1 : -1);
    });

  // Forward: in from the end side, out to the start side (mirrored for RTL
  // and when going back).
  const fromEnd = direction > 0 !== isRTL;
  const entering = (fromEnd ? FadeInRight : FadeInLeft)
    .delay(110)
    .duration(420)
    .easing(Easing.out(Easing.cubic));
  const exiting = (fromEnd ? FadeOutLeft : FadeOutRight).duration(180);

  return (
    <Animated.View style={cardIntro}>
      <GestureDetector gesture={swipe}>
        <View
          style={[
            styles.card,
            dark
              ? {
                  backgroundColor: withAlpha("#FFFFFF", 0.055),
                  borderColor: withAlpha("#FFFFFF", 0.09),
                }
              : {
                  backgroundColor: colors.paper,
                  borderColor: withAlpha(colors.ink, 0.07),
                  shadowColor: colors.ink,
                  shadowOpacity: 0.08,
                  shadowRadius: 16,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 3,
                },
          ]}
        >
          <StoryBars scene={scene} progress={progress} />
          <View style={styles.stage}>
            <Animated.View
              key={scene}
              entering={entering}
              exiting={exiting}
              style={StyleSheet.absoluteFill}
            >
              {scene === 0 ? (
                <SyncScene />
              ) : scene === 1 ? (
                <TripScene />
              ) : (
                <CostsScene />
              )}
            </Animated.View>
          </View>
        </View>
      </GestureDetector>
    </Animated.View>
  );
}

function StoryBars({
  scene,
  progress,
}: {
  scene: number;
  progress: SharedValue<number>;
}) {
  const { colors, scheme } = useTheme();
  const track =
    scheme === "dark" ? withAlpha("#FFFFFF", 0.12) : withAlpha(colors.ink, 0.1);
  const fill = scheme === "dark" ? "#FFFFFF" : colors.accent;
  const activeStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));
  return (
    <View style={styles.bars}>
      {Array.from({ length: SCENES }, (_, index) => (
        <View key={index} style={[styles.barTrack, { backgroundColor: track }]}>
          {index < scene ? (
            <View
              style={[styles.barFill, { width: "100%", backgroundColor: fill }]}
            />
          ) : index === scene ? (
            <Animated.View
              style={[styles.barFill, { backgroundColor: fill }, activeStyle]}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function SceneHeader({
  icon,
  tint,
  title,
  body,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  body: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <View style={[styles.badge, { backgroundColor: withAlpha(tint, 0.16) }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <View style={styles.flex}>
        <AppText
          numberOfLines={1}
          className="text-sm"
          style={{ color: colors.ink, fontWeight: "700" }}
        >
          {title}
        </AppText>
        <AppText
          numberOfLines={1}
          className="text-xs"
          style={{ color: colors.muted }}
        >
          {body}
        </AppText>
      </View>
    </View>
  );
}

function Person({
  color,
  size = 16,
  ring,
}: {
  color: string;
  size?: number;
  ring?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: ring ? 1.5 : 0,
        borderColor: ring,
      }}
    >
      <Ionicons name="person" size={size * 0.55} color="#FFFFFF" />
    </View>
  );
}

function LiveDot() {
  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(0.35, { duration: 800 }),
          withTiming(1, { duration: 800 }),
        ),
        -1,
        false,
      ),
    );
  }, [pulse]);
  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));
  return <Animated.View style={[styles.liveDot, style]} />;
}

function useRowBackground() {
  const { colors, scheme } = useTheme();
  return scheme === "dark"
    ? withAlpha("#FFFFFF", 0.045)
    : withAlpha(colors.ink, 0.04);
}

/** 1 — Your partner checks Milk off, then "One more thing" types itself in. */
function SyncScene() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dark = scheme === "dark";
  const rowBg = useRowBackground();
  const typedText = t("showcaseTyped");
  const [milk, setMilk] = useState(false);
  const [typed, setTyped] = useState(0);
  const [landed, setLanded] = useState(false);

  useTimeline([
    [500, () => setMilk(true)],
    ...Array.from(
      { length: typedText.length },
      (_, i): [number, () => void] => [
        1100 + (i + 1) * TYPE_MS,
        () => setTyped(i + 1),
      ],
    ),
    [1300 + typedText.length * TYPE_MS, () => setLanded(true)],
  ]);

  const caret = useSharedValue(1);
  useEffect(() => {
    caret.set(
      withRepeat(
        withSequence(
          withTiming(0, { duration: 420 }),
          withTiming(1, { duration: 420 }),
        ),
        -1,
        false,
      ),
    );
  }, [caret]);
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));
  const outline = useSharedValue(1);
  useEffect(() => {
    if (landed) outline.set(withTiming(0, SMOOTH));
  }, [landed, outline]);
  const outlineStyle = useAnimatedStyle(() => ({ opacity: outline.value }));

  return (
    <View style={styles.scene}>
      <SceneHeader
        icon="sync"
        tint={LIVE}
        title={t("showcaseSyncTitle")}
        body={t("showcaseSyncBody")}
      />
      <View style={styles.body}>
        <View style={styles.listHead}>
          <AppText
            className="text-xs"
            style={{ color: colors.muted, fontWeight: "600" }}
          >
            {t("showcaseHomeList")}
          </AppText>
          <View style={styles.flex} />
          <LiveDot />
          <AppText
            className="text-xs"
            style={{ color: dark ? LIVE : "#1F9D55", fontWeight: "700" }}
          >
            {t("showcaseLive")}
          </AppText>
          <View style={styles.pair}>
            <Person
              color={colors.accent}
              ring={dark ? "#1A2333" : colors.paper}
            />
            <View style={{ marginStart: -5 }}>
              <Person color={PARTNER} ring={dark ? "#1A2333" : colors.paper} />
            </View>
          </View>
        </View>

        <View style={[styles.item, { backgroundColor: rowBg }]}>
          {milk ? (
            <Animated.View
              entering={ZoomIn.springify().damping(12)}
              style={[styles.check, { backgroundColor: colors.accent }]}
            >
              <Ionicons name="checkmark" size={11} color="#FFFFFF" />
            </Animated.View>
          ) : (
            <View
              style={[
                styles.ring,
                { borderColor: withAlpha(colors.muted, 0.6) },
              ]}
            />
          )}
          <AppText
            numberOfLines={1}
            className="text-sm"
            style={{
              flex: 1,
              fontWeight: "600",
              color: milk ? colors.muted : colors.ink,
              textDecorationLine: milk ? "line-through" : "none",
            }}
          >
            {t("previewMilk")}
          </AppText>
          {milk ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.who}>
              <Person color={PARTNER} size={14} />
              <AppText className="text-xs" style={{ color: colors.muted }}>
                {t("showcaseNow")}
              </AppText>
            </Animated.View>
          ) : null}
        </View>

        <View style={[styles.item, { backgroundColor: rowBg }]}>
          <Animated.View
            pointerEvents="none"
            style={[
              StyleSheet.absoluteFill,
              styles.typingOutline,
              {
                borderColor: withAlpha(colors.accent, 0.55),
                backgroundColor: withAlpha(colors.accent, dark ? 0.14 : 0.08),
              },
              outlineStyle,
            ]}
          />
          <View style={[styles.ring, { borderColor: AMBER }]} />
          <View style={styles.typed}>
            <AppText
              numberOfLines={1}
              className="text-sm"
              style={{ color: colors.ink, fontWeight: "600" }}
            >
              {typedText.slice(0, typed)}
            </AppText>
            {landed ? null : (
              <Animated.View
                style={[
                  styles.caret,
                  { backgroundColor: colors.accent },
                  caretStyle,
                ]}
              />
            )}
          </View>
          {landed ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.who}>
              <Person color={colors.accent} size={14} />
              <AppText className="text-xs" style={{ color: colors.muted }}>
                {t("showcaseNow")}
              </AppText>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** A ring drawn with two rotating half-circles (no SVG needed). */
function ProgressRing({
  progress,
  size,
  stroke,
  color,
  track,
  children,
}: {
  progress: SharedValue<number>;
  size: number;
  stroke: number;
  color: string;
  track: string;
  children?: ReactNode;
}) {
  const half = size / 2;
  const arc = {
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: stroke,
    borderColor: "transparent",
    borderTopColor: color,
    borderLeftColor: color,
    position: "absolute" as const,
    top: 0,
  };
  const rightStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-45 + Math.min(progress.value, 0.5) * 360}deg` }],
  }));
  const leftStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${135 + Math.max(0, progress.value - 0.5) * 360}deg` },
    ],
  }));
  return (
    <View style={{ width: size, height: size, direction: "ltr" }}>
      <View
        style={{
          position: "absolute",
          width: size,
          height: size,
          borderRadius: half,
          borderWidth: stroke,
          borderColor: track,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: half,
          width: half,
          height: size,
          overflow: "hidden",
        }}
      >
        <Animated.View style={[arc, { left: -half }, rightStyle]} />
      </View>
      <View
        style={{
          position: "absolute",
          left: 0,
          width: half,
          height: size,
          overflow: "hidden",
        }}
      >
        <Animated.View style={[arc, { left: 0 }, leftStyle]} />
      </View>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

function Bar({ value, done }: { value: number; done: boolean }) {
  const { colors, scheme } = useTheme();
  const width = useSharedValue(0);
  useEffect(() => {
    width.set(withDelay(120, withTiming(value, SMOOTH)));
  }, [value, width]);
  const style = useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
  return (
    <View
      style={[
        styles.track,
        {
          backgroundColor:
            scheme === "dark"
              ? withAlpha("#FFFFFF", 0.08)
              : withAlpha(colors.ink, 0.07),
        },
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: done ? LIVE : colors.accent },
          style,
        ]}
      />
    </View>
  );
}

/** 2 — The ring fills and Super Market gets finished in the store. */
function TripScene() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dark = scheme === "dark";
  const [finished, setFinished] = useState(false);
  useTimeline([[1300, () => setFinished(true)]]);
  const done = finished ? 8 : 7;
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withDelay(150, withTiming(done / 10, SMOOTH)));
  }, [done, progress]);

  const sections: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    got: number;
    of: number;
  }[] = [
    { icon: "leaf-outline", label: t("categoryVegetables"), got: 3, of: 3 },
    {
      icon: "cart-outline",
      label: t("categorySupermarket"),
      got: finished ? 5 : 4,
      of: 5,
    },
    { icon: "medkit-outline", label: t("categoryPharmacy"), got: 0, of: 2 },
  ];

  return (
    <View style={styles.scene}>
      <SceneHeader
        icon="cart"
        tint={TRIP_BLUE}
        title={t("showcaseTripTitle")}
        body={t("showcaseTripHint")}
      />
      <View style={[styles.body, styles.tripBody]}>
        <ProgressRing
          progress={progress}
          size={68}
          stroke={6}
          color={colors.accent}
          track={dark ? withAlpha("#FFFFFF", 0.1) : withAlpha(colors.ink, 0.08)}
        >
          <AppText
            style={{
              color: colors.ink,
              fontWeight: "800",
              fontSize: 16,
              lineHeight: 20,
            }}
          >
            {`${done}`}
            <AppText
              style={{
                color: colors.muted,
                fontWeight: "600",
                fontSize: 11,
                lineHeight: 20,
              }}
            >
              /10
            </AppText>
          </AppText>
        </ProgressRing>
        <View style={styles.sections}>
          {sections.map((section) => {
            const complete = section.got === section.of;
            return (
              <View key={section.label} style={styles.section}>
                <View style={styles.sectionHead}>
                  <Ionicons
                    name={section.icon}
                    size={13}
                    color={colors.muted}
                  />
                  <AppText
                    numberOfLines={1}
                    className="text-xs"
                    style={{ color: colors.ink, flex: 1, fontWeight: "600" }}
                  >
                    {section.label}
                  </AppText>
                  <AppText
                    className="text-xs"
                    style={{
                      fontWeight: "700",
                      color: complete
                        ? dark
                          ? LIVE
                          : "#1F9D55"
                        : colors.muted,
                    }}
                  >
                    {complete
                      ? `✓ ${section.got}/${section.of}`
                      : `${section.got}/${section.of}`}
                  </AppText>
                </View>
                <Bar value={section.got / section.of} done={complete} />
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** 3 — Prices fill in line by line; the last arrives with "Scan receipt". */
function CostsScene() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const dark = scheme === "dark";
  const [shown, setShown] = useState(0);
  useTimeline([
    [350, () => setShown(1)],
    [700, () => setShown(2)],
    [1700, () => setShown(3)],
  ]);
  const lines = [
    { label: t("previewMilk"), price: "1.20" },
    { label: t("showcaseBread"), price: "0.80" },
    { label: t("showcaseEggs"), price: "2.10" },
  ];

  const bump = useSharedValue(1);
  useEffect(() => {
    if (shown < 3) return;
    bump.set(
      withSequence(
        withTiming(1.1, { duration: 160, easing: Easing.out(Easing.quad) }),
        withSpring(1, { damping: 10, stiffness: 220 }),
      ),
    );
  }, [bump, shown]);
  const bumpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bump.value }],
  }));

  return (
    <View style={styles.scene}>
      <SceneHeader
        icon="receipt-outline"
        tint={AMBER}
        title={t("showcaseCostsTitle")}
        body={t("showcaseCostsBody")}
      />
      <View style={styles.body}>
        <View
          style={[
            styles.receipt,
            {
              backgroundColor: dark
                ? withAlpha("#FFFFFF", 0.05)
                : withAlpha(colors.ink, 0.035),
            },
          ]}
        >
          {lines.map((line, index) => (
            <View
              key={line.label}
              style={[
                styles.line,
                index > 0
                  ? {
                      borderTopWidth: StyleSheet.hairlineWidth,
                      borderTopColor: dark
                        ? withAlpha("#FFFFFF", 0.1)
                        : withAlpha(colors.ink, 0.1),
                    }
                  : null,
              ]}
            >
              <AppText
                numberOfLines={1}
                className="text-sm"
                style={{ color: colors.ink, flex: 1 }}
              >
                {line.label}
              </AppText>
              {shown > index ? (
                <Animated.View entering={FadeIn.duration(320)}>
                  <AppText
                    className="text-sm"
                    style={{ color: colors.ink, fontWeight: "700" }}
                  >
                    {line.price}
                  </AppText>
                </Animated.View>
              ) : (
                <AppText
                  className="text-sm"
                  style={{ color: AMBER, fontWeight: "700" }}
                >
                  —
                </AppText>
              )}
            </View>
          ))}
        </View>
        <View style={styles.costsFoot}>
          <AppText
            numberOfLines={1}
            className="text-xs"
            style={{ color: colors.muted, flexShrink: 1 }}
          >
            {t("showcasePriced", { priced: shown, count: 3 })}
          </AppText>
          <Animated.View
            style={[
              styles.scan,
              { backgroundColor: withAlpha(AMBER, 0.14) },
              bumpStyle,
            ]}
          >
            <Ionicons name="scan-outline" size={13} color={AMBER} />
            <AppText
              className="text-xs"
              style={{ color: AMBER, fontWeight: "700" }}
            >
              {t("scanReceipt")}
            </AppText>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  center: { alignItems: "center", justifyContent: "center" },
  card: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  bars: { flexDirection: "row", gap: 5 },
  barTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    flexDirection: "row",
  },
  barFill: { height: "100%", borderRadius: 2 },
  stage: { height: BODY_HEIGHT + 52, marginTop: 12, overflow: "hidden" },
  scene: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { height: BODY_HEIGHT, marginTop: 10, justifyContent: "center" },
  listHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: LIVE },
  pair: { flexDirection: "row", alignItems: "center", marginStart: 6 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  typingOutline: { borderWidth: 1, borderRadius: 12 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    marginHorizontal: 1.5,
  },
  typed: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  caret: { width: 1.5, height: 16, borderRadius: 1, marginHorizontal: 1 },
  who: { flexDirection: "row", alignItems: "center", gap: 4 },
  tripBody: { flexDirection: "row", alignItems: "center", gap: 16 },
  sections: { flex: 1, minWidth: 0, gap: 10 },
  section: { gap: 4 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: "hidden",
    flexDirection: "row",
  },
  fill: { height: "100%", borderRadius: 3 },
  // A soft solid panel with hairline rows (a dashed border renders badly on
  // Android's rounded corners).
  receipt: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  line: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 32 },
  costsFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 12,
  },
  scan: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
  },
});
