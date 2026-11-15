/**
 * The server sleeps when nobody uses it and takes about a minute to wake, far
 * longer than one request waits. A screen that fell back to the phone's saved
 * copy uses this to ask again by itself until the real answer arrives.
 */
const WAITS_MS = [4_000, 8_000, 15_000, 25_000, 40_000];

export function createWakeRetry() {
  // Set from an effect with setRun, so nothing is read during render.
  let run: () => unknown = () => undefined;
  let step = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return {
    /** What to call when a wait is over: the screen's latest refresh. */
    setRun(next: () => unknown) {
      run = next;
    },
    /** The last answer was the saved copy (no connection, or no reply in time). */
    stale() {
      if (timer) return;
      if (step >= WAITS_MS.length) {
        // Really offline: stop here. The next refresh (pull, foreground, a
        // tab change) starts the waits again.
        step = 0;
        return;
      }
      timer = setTimeout(() => {
        timer = null;
        void run();
      }, WAITS_MS[step]);
      step += 1;
    },
    /** The server answered. */
    fresh() {
      clear();
      step = 0;
    },
    cancel() {
      clear();
      step = 0;
    },
  };
}
