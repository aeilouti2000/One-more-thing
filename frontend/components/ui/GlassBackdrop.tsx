import { StyleSheet, View } from "react-native";
import { glassBackdropStyle } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * The glass theme's page background: the theme colour at the top of the page,
 * fading to near black at the bottom. Put it first inside a page's root so
 * everything else draws over it. Renders nothing in the light and dark themes.
 *
 * Every page paints its own: pages in a stack sit on top of each other, so
 * one shared background behind see-through pages would show the page below.
 * The fade only runs top to bottom, so two pages side by side (the unfolded
 * layout) still read as one background.
 */
export function GlassBackdrop() {
  const { accent, glass } = useTheme();
  if (!glass) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, glassBackdropStyle(accent)]} />
  );
}
