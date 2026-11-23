import "@/features/auth/utils/session-storage";
import { makeMutable, ReduceMotion, useReducedMotion } from "react-native-reanimated";

/**
 * The Animations setting: on (the default) or off.
 *
 * On is the app exactly as it is written. Nothing here changes a value, a
 * duration or a prop while the setting is on; every use of it in the app is
 * "off ? something else : the original".
 *
 * Off removes the motion that only decorates a change (slides, fades,
 * springs) and keeps what tells you something (a loading shimmer, an error
 * shake). One switch does most of it: `MotionConfig` asks Reanimated to finish
 * every animation at once. The rest of the app only looks here for what that
 * switch cannot reach: page transitions, pop-up fades, the swipe between
 * lists, and entering / exiting animations (which would otherwise start from
 * a hidden first frame and flash).
 */
const STORAGE_KEY = "one-more-thing.motion";

/**
 * For an animation that still plays with the setting off. The phone's own
 * "remove animations" setting keeps deciding for it, exactly as before: this
 * is the value Reanimated would have worked out by itself.
 */
// eslint-disable-next-line react-hooks/rules-of-hooks -- not a real hook: it returns a constant read at startup
export const KEEP_MOTION = useReducedMotion() ? ReduceMotion.System : ReduceMotion.Never;

function storage() {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    // SSR and some native runtimes do not expose localStorage.
  }
  return null;
}

function readStored(): boolean {
  try {
    return storage()?.getItem(STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

/** What the user picked. */
let chosenOff = readStored();
/** The choice only applies once someone is signed in: the welcome pages are a moving showcase. */
let signedIn = false;
/** What applies right now. */
let activeOff = false;
/** The same value for the UI thread. Only ever written when it changes. */
const activeOffOnUI = makeMutable(false);
const listeners = new Set<() => void>();

function apply() {
  const next = chosenOff && signedIn;
  if (next !== activeOff) {
    activeOff = next;
    activeOffOnUI.value = next;
  }
  for (const listener of listeners) listener();
}

/** The user's choice on the Animations page. */
export function readAnimationsOff(): boolean {
  return chosenOff;
}

export function writeAnimationsOff(next: boolean) {
  if (next === chosenOff) return;
  chosenOff = next;
  try {
    storage()?.setItem(STORAGE_KEY, next ? "off" : "on");
  } catch {
    // Keep the in-memory choice when persistence is unavailable.
  }
  apply();
}

/** Called by `MotionConfig`, which knows whether someone is signed in. */
export function setMotionSignedIn(next: boolean) {
  if (next === signedIn) return;
  signedIn = next;
  // With the setting on, signing in or out changes nothing: tell no one.
  if (chosenOff) apply();
}

export function subscribeMotion(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Whether animations are off right now. For the JS thread, outside render
 * (event handlers, effects, state initialisers). While rendering use
 * `useMotionOff()`, so the component follows a change.
 *
 * Deliberately not a worklet: a worklet keeps the value a variable had when
 * the worklet was created. Worklets read `motionOffOnUI` instead.
 */
export function isMotionOff(): boolean {
  return activeOff;
}

/** `isMotionOff()` for worklets: read `motionOffOnUI.value` on the UI thread. */
export const motionOffOnUI: { readonly value: boolean } = activeOffOnUI;

/**
 * Timing for the JS stack (Settings and Home on Android) with animations off.
 * The transition itself stays: swapping it for "none" while pages are stacked
 * leaves the page underneath shifted sideways.
 */
const INSTANT = { animation: "timing", config: { duration: 0 } } as const;
export const INSTANT_STACK_TRANSITION = { open: INSTANT, close: INSTANT } as const;
