import type { ReactNode } from "react";
import type { TextStyle } from "react-native";
import { withAlpha } from "@/constants/theme";

export const preserveSpaces = {
  whiteSpace: "pre-wrap",
} as unknown as TextStyle;

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

export function hasArabicScript(value: ReactNode): boolean {
  if (typeof value === "string") return ARABIC_SCRIPT.test(value);
  if (typeof value === "number") return false;
  if (Array.isArray(value)) return value.some(hasArabicScript);
  return false;
}

/**
 * Placeholder with a small gap in front, so the blinking text cursor sits
 * beside the hint instead of on top of its first letter.
 */
export function caretGap(placeholder: string | undefined) {
  return placeholder ? ` ${placeholder}` : placeholder;
}

/**
 * Text cursor, selection highlight and its handles in the app's own colour,
 * instead of the phone's default. Spread onto a TextInput.
 */
export function caretColors(accent: string) {
  return {
    cursorColor: accent,
    selectionColor: withAlpha(accent, 0.3),
    selectionHandleColor: accent,
  } as const;
}
