import { onlineManager } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { probeWaitMs } from "@/features/offline/rules";

/**
 * Whether the app can reach its server right now. Two signals together:
 *
 * - the phone's own connection (expo-network): knows at once when Wi-Fi or
 *   mobile data drops;
 * - what the requests say: "connected" does not mean the server answers (it
 *   sleeps when unused and takes about a minute to wake).
 *
 * TanStack Query's onlineManager carries the answer, so waiting changes pause
 * and continue by themselves.
 */
let deviceConnected = true;
let serverReachable = true;
let healthUrl: string | null = null;
let probeTimer: ReturnType<typeof setTimeout> | null = null;
let probeAttempt = 0;
let probing: Promise<boolean> | null = null;
let started = false;

const PROBE_TIMEOUT_MS = 6000;

function apply() {
  onlineManager.setOnline(deviceConnected && serverReachable);
}

function stopProbing() {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = null;
  probeAttempt = 0;
}

function scheduleProbe() {
  if (probeTimer || serverReachable) return;
  probeTimer = setTimeout(() => {
    probeTimer = null;
    void probeNow();
  }, probeWaitMs(probeAttempt));
  probeAttempt += 1;
}

async function ping() {
  if (!healthUrl) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    // Any answer at all means the server is there.
    await fetch(healthUrl, { signal: controller.signal, cache: "no-store" });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the server once whether it is back. Resolves true when it answered. */
export function probeNow(): Promise<boolean> {
  if (probing) return probing;
  probing = (async () => {
    if (probeTimer) clearTimeout(probeTimer);
    probeTimer = null;
    const answered = await ping();
    if (answered) reportRequestOk();
    else scheduleProbe();
    return answered;
  })().finally(() => {
    probing = null;
  });
  return probing;
}

/** A request got an answer (any status): the server is reachable. */
export function reportRequestOk() {
  if (serverReachable) return;
  serverReachable = true;
  stopProbing();
  apply();
}

/** A request got no answer: treat the server as unreachable until a check succeeds. */
export function reportRequestFailed() {
  if (serverReachable) {
    serverReachable = false;
    apply();
  }
  scheduleProbe();
}

export function isOnline() {
  return onlineManager.isOnline();
}

export function onOnlineChange(listener: (online: boolean) => void) {
  return onlineManager.subscribe(listener);
}

/** Re-renders when the app goes offline or comes back. */
export function useOnline() {
  return useSyncExternalStore(
    (notify) => onlineManager.subscribe(notify),
    () => onlineManager.isOnline(),
    () => true,
  );
}

type NetworkModule = typeof import("expo-network");

/** Missing in an app build made before this feature; requests alone decide then. */
function loadNetworkModule(): NetworkModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-network") as NetworkModule;
  } catch {
    return null;
  }
}

/** Starts watching the connection. `health` is a URL the server answers without sign-in. */
export function startNetworkWatch(health: string) {
  healthUrl = health;
  if (started) return;
  started = true;
  // Only these signals decide (not the browser's own online/offline events).
  onlineManager.setEventListener(() => undefined);

  const network = loadNetworkModule();
  const onDevice = (connected: boolean | undefined) => {
    const next = connected !== false;
    if (next === deviceConnected) return;
    deviceConnected = next;
    apply();
    // Back on a network: find out now whether the server answers.
    if (next && !serverReachable) void probeNow();
  };
  if (network) {
    try {
      void network
        .getNetworkStateAsync()
        .then((state) => onDevice(state.isConnected))
        .catch(() => undefined);
      network.addNetworkStateListener((state) => onDevice(state.isConnected));
    } catch {
      // No native module in this build: requests alone decide.
    }
  }

  AppState.addEventListener("change", (state) => {
    if (state === "active" && !serverReachable) void probeNow();
  });
}
