import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Seconds left before "Resend code" is allowed again (the server waits 60s).
 * `startAt` is the first value; `restart()` goes back to `cooldown`.
 *
 * Counted from a fixed moment, not by ticking: timers stop while the app is
 * in the background (reading the code in the mail app), and the wait must
 * still have passed on the way back.
 */
export function useResendCountdown(startAt = 60, cooldown = 60) {
  const [startedUntil] = useState(() => Date.now() + startAt * 1000);
  const until = useRef(startedUntil);
  const [seconds, setSeconds] = useState(startAt);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => {
      setSeconds(Math.max(0, Math.ceil((until.current - Date.now()) / 1000)));
    }, 500);
    return () => clearInterval(timer);
  }, [seconds]);

  const restart = useCallback(() => {
    until.current = Date.now() + cooldown * 1000;
    setSeconds(cooldown);
  }, [cooldown]);
  return { seconds, restart };
}
