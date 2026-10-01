import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { GlassFill } from "@/components/ui/BlurBackdrop";
import { useTheme } from "@/providers/ThemeProvider";

export function FloatMessage({
  message,
  tone = "error",
}: {
  message: string;
  tone?: "error" | "success";
}) {
  const { colors } = useTheme();
  const color = tone === "success" ? colors.accent : "#F87171";

  return (
    <View
      className="max-w-full overflow-hidden rounded-full border border-cove-line px-4 py-3"
      style={{
        elevation: 8,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      }}
    >
      <GlassFill />
      <AppText
        className="text-center text-sm font-semibold"
        style={{ color }}
      >
        {message}
      </AppText>
    </View>
  );
}
