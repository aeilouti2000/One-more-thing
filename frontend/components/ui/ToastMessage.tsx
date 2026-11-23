import { useEffect, useRef } from "react";
import { localizeMessage } from "@/constants/i18n";
import { showToast, type ToastTone } from "@/lib/toast";

/**
 * Drop-in for a page-level `FormMessage`: instead of red text in the page,
 * a new message shows the app's floating message card. Renders nothing.
 * Errors inside forms, sheets and dialogs stay inline with `FormMessage`.
 */
export function ToastMessage({
  message,
  tone = "default",
  onDismiss,
}: {
  message?: string | null;
  tone?: "default" | "success";
  /** Called once the message has been handed to the card. */
  onDismiss?: () => void;
}) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!message) return;
    const toastTone: ToastTone = tone === "success" ? "success" : "error";
    showToast(localizeMessage(message), toastTone);
    onDismissRef.current?.();
  }, [message, tone]);

  return null;
}
