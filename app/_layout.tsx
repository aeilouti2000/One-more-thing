import "./global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/providers/AuthProvider";
import { HouseholdProvider } from "@/providers/HouseholdProvider";
import { LanguageProvider } from "@/providers/LanguageProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";

function ThemedNavigation() {
  const { colors, scheme } = useTheme();

  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.ice },
          animation: "fade",
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="create-home" />
        <Stack.Screen name="join-home" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item" />
        <Stack.Screen name="legal" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <HouseholdProvider>
            <ThemedNavigation />
          </HouseholdProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
