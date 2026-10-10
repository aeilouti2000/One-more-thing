import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { floatedCardStyle } from "@/constants/theme";
import { useTheme } from "@/providers/ThemeProvider";

export function FloatMessage({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "success";
}) {
  const { colors, scheme } = useTheme();
  const color = tone === "success" ? colors.accent : scheme === "dark" ? "#F07178" : "#C2414A";

  return (
    <View
      className="max-w-full overflow-hidden rounded-full px-4 py-3"
      style={floatedCardStyle(scheme, colors)}
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
