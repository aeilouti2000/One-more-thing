import { useEffect, useRef, useState } from "react";
import { AppText } from "@/components/ui/AppText";
import { localizeMessage } from "@/constants/i18n";
import { useI18n } from "@/providers/LanguageProvider";

const SUCCESS_HIDE_MS = 2500;

type FormMessageProps = {
  message?: string | null;
  tone?: "default" | "success";
  /** Override auto-hide. Success defaults to 2500ms; errors stay until cleared. */
  autoHideMs?: number | null;
  onDismiss?: () => void;
};

export function FormMessage({
  message,
  tone = "default",
  autoHideMs,
  onDismiss,
}: FormMessageProps) {
  useI18n();
  const [dismissedMessage, setDismissedMessage] = useState<string | null>(null);
  const onDismissRef = useRef(onDismiss);

  const hideAfter =
    autoHideMs === undefined
      ? tone === "success"
        ? SUCCESS_HIDE_MS
        : null
      : autoHideMs;

  if (!message && dismissedMessage !== null) {
    setDismissedMessage(null);
  }

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!message || hideAfter == null) return;

    const timer = setTimeout(() => {
      setDismissedMessage(message);
      onDismissRef.current?.();
    }, hideAfter);

    return () => clearTimeout(timer);
  }, [message, hideAfter]);

  if (!message || dismissedMessage === message) {
    return null;
  }

  return (
    <AppText
      className={`text-base leading-6 ${
        tone === "success" ? "text-cove-accent" : ""
      }`}
      style={tone === "success" ? undefined : { color: "#F87171" }}
    >
      {localizeMessage(message)}
    </AppText>
  );
}
