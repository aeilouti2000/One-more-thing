import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  Easing,
  runOnJS,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

/**
 * Must match the expo-splash-screen config in app.json. The native splash is
 * plain navy (its image is transparent), so this overlay can replace it at any
 * moment without a visible change, and the logo is drawn from nothing.
 */
const SPLASH_BACKGROUND = "#071633";
/** Same size the logo had on the native splash: 240 dp for the 1024 px artwork. */
const LOGO_SIZE = 240;

/** Never keep the app covered longer than this, ready or not. */
const MAX_HOLD_MS = 2600;
/** Hide the native splash anyway if the overlay never lays out. */
const NATIVE_HIDE_FALLBACK_MS = 1000;
/** Let the finished logo sit for a moment before it bursts. */
const DRAWN_HOLD_MS = 200;

const DIP_MS = 420;
const DIP_SCALE = 0.8;
const BURST_MS = 300;
const BURST_SCALE = 14;

// The mark exactly as scripts/build-icons.mjs draws it on a 100×100 canvas.
// splash-icon.png scales it by SPLASH_SCALE about the centre; the viewBox
// below does the same, so the drawn logo lands where the PNG logo would.
const SPLASH_SCALE = 0.86;
const VIEW = 100 / SPLASH_SCALE;
const VIEW_BOX = `${50 - VIEW / 2} ${50 - VIEW / 2} ${VIEW} ${VIEW}`;

const NAVY = "#071633";
const SOFT_BLUE = "#8FAEE6";
const WHITE = "#FFFFFF";
const EMERALD = "#21C47A";
/** Outline traced before a shape fills in, about 1.4 dp on screen. */
const OUTLINE = 0.7;
const FILL_MS = 180;

const circle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}a${r} ${r} 0 1 1 0 ${2 * r}a${r} ${r} 0 1 1 0 ${-2 * r}Z`;
const pill = (x: number, y: number, w: number, h: number) => {
  const r = h / 2;
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
};
const circleLength = (r: number) => 2 * Math.PI * r;
const pillLength = (w: number, h: number) => 2 * (w - h) + Math.PI * h;

type Shape =
  | { kind: "fill"; d: string; color: string; at: number }
  | { kind: "stroke"; d: string; color: string; width: number; length: number; at: number; ms: number };

/** A ticked row: circle and bar trace their outlines and fill in, then the tick is drawn. */
const row = (cy: number, barWidth: number, color: string, at: number): Shape[] => [
  { kind: "fill", d: circle(24.5, cy, 6.5), color, at: at + 350 },
  { kind: "stroke", d: circle(24.5, cy, 6.5), color, width: OUTLINE, length: circleLength(6.5), at, ms: 350 },
  { kind: "fill", d: pill(36, cy - 6.5, barWidth, 13), color, at: at + 500 },
  {
    kind: "stroke",
    d: pill(36, cy - 6.5, barWidth, 13),
    color,
    width: OUTLINE,
    length: pillLength(barWidth, 13),
    at: at + 150,
    ms: 350,
  },
  {
    kind: "stroke",
    d: `M21.7 ${cy + 0.2}l2 2l3.6-4.2`,
    color: NAVY,
    width: 1.9,
    length: Math.hypot(2, 2) + Math.hypot(3.6, 4.2),
    at: at + 500,
    ms: 250,
  },
];

/** The logo in drawing order; `at` and `ms` are milliseconds from the start of the drawing. */
const SHAPES: Shape[] = [
  ...row(26.5, 24, SOFT_BLUE, 50),
  ...row(45.5, 36, WHITE, 300),
  { kind: "fill", d: pill(18, 58, 64, 22), color: EMERALD, at: 1100 },
  {
    kind: "stroke",
    d: pill(18, 58, 64, 22),
    color: EMERALD,
    width: OUTLINE,
    length: pillLength(64, 22),
    at: 650,
    ms: 450,
  },
  // O, M, T written one after another.
  { kind: "stroke", d: circle(32.7, 69, 4.6), color: NAVY, width: 3.6, length: circleLength(4.6), at: 1200, ms: 300 },
  {
    kind: "stroke",
    d: "M45.4 73.6V64.4L50 71.3L54.6 64.4V73.6",
    color: NAVY,
    width: 3.6,
    length: 9.2 * 2 + Math.hypot(4.6, 6.9) * 2,
    at: 1320,
    ms: 350,
  },
  { kind: "stroke", d: "M62.7 64.4H71.9", color: NAVY, width: 3.6, length: 9.2, at: 1450, ms: 150 },
  { kind: "stroke", d: "M67.3 64.4V73.6", color: NAVY, width: 3.6, length: 9.2, at: 1560, ms: 190 },
];

const DRAW_MS = Math.max(
  ...SHAPES.map((s) => (s.kind === "stroke" ? s.at + s.ms : s.at + FILL_MS)),
);

const AnimatedPath = Animated.createAnimatedComponent(Path);

function progressAt(clock: number, at: number, ms: number) {
  "worklet";
  return Math.min(Math.max((clock - at) / ms, 0), 1);
}

function easeInOut(p: number) {
  "worklet";
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

type FillShape = Extract<Shape, { kind: "fill" }>;
type StrokeShape = Extract<Shape, { kind: "stroke" }>;

function FillPath({ shape, clock }: { shape: FillShape; clock: SharedValue<number> }) {
  const animatedProps = useAnimatedProps(() => ({
    fillOpacity: progressAt(clock.value, shape.at, FILL_MS),
  }));
  return <AnimatedPath d={shape.d} fill={shape.color} fillOpacity={0} animatedProps={animatedProps} />;
}

function StrokePath({ shape, clock }: { shape: StrokeShape; clock: SharedValue<number> }) {
  // Dash slightly longer than the path so a closed outline has no seam.
  const dash = shape.length + 0.5;
  const animatedProps = useAnimatedProps(() => {
    const p = progressAt(clock.value, shape.at, shape.ms);
    // Hidden until it starts: a zero-length dash would still show a round cap.
    return { strokeDashoffset: dash * (1 - easeInOut(p)), strokeOpacity: p > 0 ? 1 : 0 };
  });
  return (
    <AnimatedPath
      d={shape.d}
      fill="none"
      stroke={shape.color}
      strokeWidth={shape.width}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={[dash, dash]}
      strokeDashoffset={dash}
      strokeOpacity={0}
      animatedProps={animatedProps}
    />
  );
}

// Swap instantly: the overlay underneath is the same navy, so a fade adds nothing.
SplashScreen.setOptions({ duration: 0, fade: false });

/**
 * Launch animation: the logo draws itself line by line on the splash colour,
 * holds, dips a little, then bursts towards the viewer while the background
 * drops away, revealing the app that has loaded underneath.
 *
 * `ready` should turn true once the first real screen can show; the overlay
 * waits for it (up to MAX_HOLD_MS) so the burst reveals content, not a spinner.
 */
export function LaunchIntro({ ready }: { ready: boolean }) {
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);
  const [nativeHidden, setNativeHidden] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const [held, setHeld] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const nativeHideRequested = useRef(false);
  const animating = useRef(false);
  // Once true it stays true: held and timedOut never go back.
  const start = held && (ready || timedOut);

  const clock = useSharedValue(0);
  const scale = useSharedValue(1);
  const backdrop = useSharedValue(1);
  const logo = useSharedValue(1);

  const hideNative = () => {
    if (nativeHideRequested.current) return;
    nativeHideRequested.current = true;
    // A frame later, so the overlay is on screen before the native view goes.
    requestAnimationFrame(() => {
      void SplashScreen.hideAsync();
      setNativeHidden(true);
    });
  };

  useEffect(() => {
    const fallback = setTimeout(hideNative, NATIVE_HIDE_FALLBACK_MS);
    const cap = setTimeout(() => setTimedOut(true), MAX_HOLD_MS);
    return () => {
      clearTimeout(fallback);
      clearTimeout(cap);
    };
    // Timers run once, from the first frame the overlay exists.
  }, []);

  // Draw once the overlay is what's on screen, so the drawing is seen from its first stroke.
  useEffect(() => {
    if (!nativeHidden) return;
    const finishDrawing = () => setDrawn(true);
    if (reduceMotion) {
      clock.value = DRAW_MS;
      finishDrawing();
      return;
    }
    clock.value = withTiming(DRAW_MS, { duration: DRAW_MS, easing: Easing.linear }, (ok) => {
      if (ok) runOnJS(finishDrawing)();
    });
  }, [clock, nativeHidden, reduceMotion]);

  useEffect(() => {
    if (!drawn) return;
    const timer = setTimeout(() => setHeld(true), DRAWN_HOLD_MS);
    return () => clearTimeout(timer);
  }, [drawn]);

  useEffect(() => {
    if (!start || animating.current) return;
    animating.current = true;
    const finish = () => setDone(true);

    if (reduceMotion) {
      backdrop.value = withTiming(0, { duration: 250 });
      logo.value = withTiming(0, { duration: 250 }, (ok) => {
        if (ok) runOnJS(finish)();
      });
      return;
    }

    // Dip: a slow, small shrink, like winding up.
    // Burst: accelerate past the viewer, much faster than the dip.
    scale.value = withSequence(
      withTiming(DIP_SCALE, { duration: DIP_MS, easing: Easing.inOut(Easing.quad) }),
      withTiming(BURST_SCALE, { duration: BURST_MS, easing: Easing.in(Easing.cubic) }, (ok) => {
        if (ok) runOnJS(finish)();
      }),
    );
    // The background drops away once the logo is about twice its size...
    backdrop.value = withDelay(
      DIP_MS + BURST_MS * 0.45,
      withTiming(0, { duration: BURST_MS * 0.25, easing: Easing.out(Easing.quad) }),
    );
    // ...and the logo is gone before it finishes growing past the screen.
    logo.value = withDelay(
      DIP_MS + BURST_MS * 0.55,
      withTiming(0, { duration: BURST_MS * 0.3, easing: Easing.in(Easing.quad) }),
    );
  }, [backdrop, logo, reduceMotion, scale, start]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [{ scale: scale.value }],
  }));

  if (done) return null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      // Block touches while the logo covers the app; let them through once it bursts.
      pointerEvents={start ? "none" : "auto"}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={hideNative}
    >
      <StatusBar style="light" />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BACKGROUND }, backdropStyle]}
      />
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={[styles.logo, logoStyle]}>
          <Svg width={LOGO_SIZE} height={LOGO_SIZE} viewBox={VIEW_BOX}>
            {SHAPES.map((shape, i) => (
              shape.kind === "fill" ? (
                <FillPath key={i} shape={shape} clock={clock} />
              ) : (
                <StrokePath key={i} shape={shape} clock={clock} />
              )
            ))}
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
  },
});
