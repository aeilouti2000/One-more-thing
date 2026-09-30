import type { TextStyle } from "react-native";

export const appFont = {
  regular: "ReadexPro_400Regular",
  medium: "ReadexPro_500Medium",
  semibold: "ReadexPro_600SemiBold",
  bold: "ReadexPro_700Bold",
} as const;

export function appFontFamily(weight?: TextStyle["fontWeight"]) {
  const value = String(weight ?? "400");
  if (value === "700" || value === "bold") return appFont.bold;
  if (value === "600" || value === "semibold") return appFont.semibold;
  if (value === "500" || value === "medium") return appFont.medium;
  return appFont.regular;
}
