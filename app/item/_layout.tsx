import { Stack } from "expo-router";
import { RequireSession } from "@/components/auth/RequireSession";
import { useTheme } from "@/providers/ThemeProvider";

export default function ItemLayout() {
  const { colors } = useTheme();

  return (
    <RequireSession requireHome>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ice },
        }}
      >
        <Stack.Screen
          name="new"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen name="[id]" />
      </Stack>
    </RequireSession>
  );
}
