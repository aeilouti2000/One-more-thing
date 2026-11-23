// TanStack Query keeps long timers (cache clean-up) that would hold a finished
// test run open. Import this first in a test that uses the query client.
import { timeoutManager } from "@tanstack/query-core";

const loose = (timer) => {
  timer.unref?.();
  return timer;
};
timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) => loose(setTimeout(callback, delay)),
  clearTimeout: (timer) => clearTimeout(timer),
  setInterval: (callback, delay) => loose(setInterval(callback, delay)),
  clearInterval: (timer) => clearInterval(timer),
});
