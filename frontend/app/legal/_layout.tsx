import { Stack } from "expo-router";
import { useTheme } from "@/providers/ThemeProvider";

export default function LegalLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.ice },
      }}
    >
      <Stack.Screen name="privacy" />
      <Stack.Screen name="terms" />
    </Stack>
  );
}
