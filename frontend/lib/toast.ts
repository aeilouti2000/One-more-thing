import { useSyncExternalStore } from "react";

export type ToastTone = "error" | "success";
export type Toast = { id: number; message: string; tone: ToastTone };

const HIDE_AFTER_MS: Record<ToastTone, number> = { success: 2500, error: 4000 };

let current: Toast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Shows a message card over the app. A new one replaces the one showing. */
export function showToast(message: string, tone: ToastTone = "error") {
  if (!message) return;
  if (timer) clearTimeout(timer);
  const toast = { id: nextId++, message, tone };
  current = toast;
  timer = setTimeout(() => hideToast(toast.id), HIDE_AFTER_MS[tone]);
  emit();
}

/** Hides the card; with an id, only if that card is still the one showing. */
export function hideToast(id?: number) {
  if (!current || (id !== undefined && current.id !== id)) return;
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The card showing right now, if any. */
export function readToast(): Toast | null {
  return current;
}

export function useToast(): Toast | null {
  return useSyncExternalStore(subscribe, readToast, readToast);
}
