import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useTheme } from "@/providers/ThemeProvider";

export function FloatMessage({ message }: { message: string }) {
  const { colors, scheme } = useTheme();

  return (
    <View
      className="max-w-full rounded-full px-4 py-3"
      style={{
        backgroundColor: colors.paper,
        elevation: 8,
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      }}
    >
      <AppText
        className="text-center text-sm font-semibold"
        style={{ color: scheme === "dark" ? "#F87171" : "#DC2626" }}
      >
        {message}
      </AppText>
    </View>
  );
}
