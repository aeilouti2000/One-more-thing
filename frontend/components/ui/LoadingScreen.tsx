import { ActivityIndicator, View } from "react-native";
import { AppLogo } from "@/components/ui/AppLogo";
import { GlassBackdrop } from "@/components/ui/GlassBackdrop";
import { useTheme } from "@/providers/ThemeProvider";

export function LoadingScreen() {
  const { colors } = useTheme();

  return (
    <View
      className="flex-1 items-center justify-center bg-cove-ice"
      style={{ backgroundColor: colors.ice }}
    >
      <GlassBackdrop />
      <View className="mb-5">
        <AppLogo size={88} />
      </View>
      <ActivityIndicator size="large" color={colors.accentText} />
    </View>
  );
}
