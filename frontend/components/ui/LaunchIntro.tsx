import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * Must match the expo-splash-screen config in app.json: same colour, same
 * image, same width. The native splash draws the image `imageWidth` dp wide,
 * centred on the whole screen, so this overlay looks identical and the
 * native splash can be swapped for it without a visible change.
 */
const SPLASH_BACKGROUND = "#071633";
const SPLASH_IMAGE_WIDTH = 240;

/** The whole logo, pixel for pixel what the native splash shows. */
const SPLASH_IMAGE = require("@/assets/images/splash-icon.png");
/** The same logo without its navy square, for the burst over the app. */
const SPLASH_GLYPH = require("@/assets/images/splash-glyph.png");

/** Show the still logo at least this long once it has replaced the native one. */
const MIN_HOLD_MS = 250;
/** Never keep the app covered longer than this, ready or not. */
const MAX_HOLD_MS = 2500;
/** Hide the native splash anyway if the overlay image never reports in. */
const NATIVE_HIDE_FALLBACK_MS = 1000;

const DIP_MS = 420;
const DIP_SCALE = 0.8;
const BURST_MS = 300;
const BURST_SCALE = 14;

// Swap instantly: the overlay underneath is identical, so a fade adds nothing
// and could show both logos at once if the animation starts during it.
SplashScreen.setOptions({ duration: 0, fade: false });

/**
 * Launch animation in the style of a logo "reveal": the logo holds, dips a
 * little, then bursts towards the viewer while the background drops away,
 * revealing the app that has already loaded underneath.
 *
 * `ready` should turn true once the first real screen can show; the overlay
 * waits for it (up to MAX_HOLD_MS) so the burst reveals content, not a spinner.
 */
export function LaunchIntro({ ready }: { ready: boolean }) {
  const reduceMotion = useReducedMotion();
  const [done, setDone] = useState(false);
  const [nativeHidden, setNativeHidden] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [held, setHeld] = useState(false);
  const nativeHideRequested = useRef(false);
  const animating = useRef(false);
  // Once true it stays true: held and timedOut never go back.
  const start = held && (ready || timedOut);

  const scale = useSharedValue(1);
  const backdrop = useSharedValue(1);
  const solidLogo = useSharedValue(1);
  const glyph = useSharedValue(1);

  const hideNative = () => {
    if (nativeHideRequested.current) return;
    nativeHideRequested.current = true;
    setNativeHidden(true);
    // A frame later, so the overlay is on screen before the native view goes.
    requestAnimationFrame(() => void SplashScreen.hideAsync());
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

  useEffect(() => {
    if (!nativeHidden) return;
    const timer = setTimeout(() => setHeld(true), MIN_HOLD_MS);
    return () => clearTimeout(timer);
  }, [nativeHidden]);

  useEffect(() => {
    if (!start || animating.current) return;
    animating.current = true;
    const finish = () => setDone(true);

    if (reduceMotion) {
      backdrop.value = withTiming(0, { duration: 250 });
      glyph.value = withTiming(0, { duration: 250 });
      solidLogo.value = withTiming(0, { duration: 250 }, (ok) => {
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
    // The navy square fades into the identical navy background during the
    // dip (invisible), leaving only the glyph for the burst.
    solidLogo.value = withTiming(0, { duration: DIP_MS });
    // The background drops away once the logo is about twice its size...
    backdrop.value = withDelay(
      DIP_MS + BURST_MS * 0.45,
      withTiming(0, { duration: BURST_MS * 0.25, easing: Easing.out(Easing.quad) }),
    );
    // ...and the glyph is gone before it finishes growing past the screen.
    glyph.value = withDelay(
      DIP_MS + BURST_MS * 0.55,
      withTiming(0, { duration: BURST_MS * 0.3, easing: Easing.in(Easing.quad) }),
    );
  }, [backdrop, glyph, reduceMotion, scale, solidLogo, start]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const solidStyle = useAnimatedStyle(() => ({
    opacity: solidLogo.value,
    transform: [{ scale: scale.value }],
  }));
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: glyph.value,
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
    >
      <StatusBar style="light" />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: SPLASH_BACKGROUND }, backdropStyle]}
      />
      <View style={styles.center} pointerEvents="none">
        <Animated.View style={[styles.logo, glyphStyle]}>
          <Image source={SPLASH_GLYPH} style={styles.image} contentFit="contain" />
        </Animated.View>
        <Animated.View style={[styles.logo, styles.stacked, solidStyle]}>
          <Image
            source={SPLASH_IMAGE}
            style={styles.image}
            contentFit="contain"
            // Hide the native splash only once this logo is really showing.
            onDisplay={hideNative}
            onError={hideNative}
          />
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
    width: SPLASH_IMAGE_WIDTH,
    height: SPLASH_IMAGE_WIDTH,
  },
  stacked: {
    position: "absolute",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});

