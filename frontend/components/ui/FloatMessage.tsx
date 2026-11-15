import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { floatedCardStyle } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

export function FloatMessage({
  message,
  tone = "error",
  wide = false,
}: {
  message: string;
  tone?: "error" | "success";
  /** Stretch across the screen instead of hugging the text. */
  wide?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const color =
    tone === "success"
      ? // The wide bar uses the main text colour (white in dark mode).
        wide
        ? colors.ink
        : colors.accent
      : scheme === "dark"
        ? "#F07178"
        : "#C2414A";

  return (
    <View
      className={`max-w-full overflow-hidden px-4 py-3 ${wide ? "self-stretch" : "rounded-full"}`}
      style={[
        floatedCardStyle(scheme, colors),
        // The wide bar is a strip with gentle corners, not a pill.
        wide ? { borderRadius: 14 } : null,
      ]}
    >
      <GlassFill soft neutral />
      <AppText
        className="text-center text-sm font-semibold"
        style={{ color }}
      >
        {message}
      </AppText>
    </View>
  );
}
