import type { TextStyle } from "react-native";

export const appFont = {
  regular: "ReadexPro_400Regular",
  medium: "ReadexPro_500Medium",
  semibold: "ReadexPro_600SemiBold",
  bold: "ReadexPro_700Bold",
} as const;

/** Single-line fields. No lineHeight: Android clips Arabic when the line box is shorter than the font. */
export const singleLineInput: TextStyle = {
  fontFamily: appFont.regular,
  fontSize: 15,
  paddingVertical: 0,
  includeFontPadding: false,
  textAlignVertical: "center",
};

export const textSizes = {
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 13, lineHeight: 18 },
  base: { fontSize: 15, lineHeight: 21 },
  lg: { fontSize: 17, lineHeight: 23 },
  xl: { fontSize: 19, lineHeight: 25 },
  "2xl": { fontSize: 22, lineHeight: 28 },
  "3xl": { fontSize: 26, lineHeight: 32 },
  "4xl": { fontSize: 30, lineHeight: 36 },
} as const;

export const fontScales = {
  small: 0.9,
  medium: 1,
  large: 1.15,
} as const;

/** Arabic glyphs read larger than Latin at the same setting, so the default sits a little lower. */
export const arabicDefaultScale = 0.92;

export type FontScaleLevel = keyof typeof fontScales;

export function scaleFontSize(size: number, scale: number) {
  return Math.round(size * scale);
}

export function appFontFamily(weight?: TextStyle["fontWeight"]) {
  const value = String(weight ?? "400");
  if (value === "700" || value === "bold") return appFont.bold;
  if (value === "600" || value === "semibold") return appFont.semibold;
  if (value === "500" || value === "medium") return appFont.medium;
  return appFont.regular;
}
