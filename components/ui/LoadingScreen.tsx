import { ActivityIndicator, View } from "react-native";
import { useTheme } from "@/providers/ThemeProvider";

export function LoadingScreen() {
  const { colors } = useTheme();

  return (
    <View
      className="flex-1 items-center justify-center bg-cove-ice"
      style={{ backgroundColor: colors.ice }}
    >
      <ActivityIndicator size="large" color={colors.accent} />
    </View>
  );
}
