import { useCallback, useEffect, useState } from "react";

/**
 * Seconds left before "Resend code" is allowed again (the server waits 60s).
 * `startAt` is the first value; `restart()` goes back to `cooldown`.
 */
export function useResendCountdown(startAt = 60, cooldown = 60) {
  const [seconds, setSeconds] = useState(startAt);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const restart = useCallback(() => setSeconds(cooldown), [cooldown]);
  return { seconds, restart };
}
