import type { ReactNode } from "react";
import type { TextStyle } from "react-native";

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
