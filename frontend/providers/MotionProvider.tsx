import { useLayoutEffect, useSyncExternalStore } from "react";
import { LogBox } from "react-native";
import { ReduceMotion, ReducedMotionConfig } from "react-native-reanimated";
import { useAuth } from "@/features/auth/providers/auth-provider";
import {
  isMotionOff,
  readAnimationsOff,
  setMotionSignedIn,
  subscribeMotion,
  writeAnimationsOff,
} from "@/lib/motion";

// Reanimated announces the "off" override below in development. It is
// intended, so it should not cover the tab bar with a warning.
if (__DEV__) LogBox.ignoreLogs(["Reduced motion setting is overwritten"]);

/**
 * Applies the Animations setting to the whole app. Render it once, inside
 * AuthProvider and above the screens.
 *
 * With the setting on (the default) it renders nothing and Reanimated is left
 * exactly as it was. With it off, and someone signed in, it tells Reanimated
 * to finish every animation at once, except the few marked KEEP_MOTION, so
 * anything added later is off by default too.
 *
 * Signed out, the setting waits: the welcome pages are a moving showcase and
 * would look broken frozen. Whether someone is signed in is read here while
 * rendering, so the switch is gone in the same update that signs the user out,
 * before the welcome page is shown.
 */
export function MotionConfig() {
  const { user } = useAuth();
  const chosenOff = useSyncExternalStore(subscribeMotion, readAnimationsOff, readAnimationsOff);
  const signedIn = user !== null;

  // Before any effect that navigates, so page transitions follow at once.
  useLayoutEffect(() => {
    setMotionSignedIn(signedIn);
  }, [signedIn]);

  return chosenOff && signedIn ? <ReducedMotionConfig mode={ReduceMotion.Always} /> : null;
}

/**
 * True while animations are off for the person signed in. The component
 * re-renders when that changes. Always false with the setting on.
 */
export function useMotionOff(): boolean {
  return useSyncExternalStore(subscribeMotion, isMotionOff, isMotionOff);
}

/** The Animations setting itself, for the settings pages. */
export function useAnimationsSetting(): { off: boolean; setOff: (off: boolean) => void } {
  const off = useSyncExternalStore(subscribeMotion, readAnimationsOff, readAnimationsOff);
  return { off, setOff: writeAnimationsOff };
}
