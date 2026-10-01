import "./global.css";
import { useEffect, useState } from "react";
import {
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
  ReadexPro_700Bold,
  useFonts,
} from "@expo-google-fonts/readex-pro";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { BlurScreen } from "@/components/ui/BlurBackdrop";
import { TabBlurProvider } from "@/components/ui/TabBlurTarget";
import { ForceUpdate } from "@/components/ui/ForceUpdate";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { requiredAppUpdate } from "@/lib/app-release";
import { AuthProvider } from "@/providers/AuthProvider";
import { CategoriesProvider } from "@/providers/CategoriesProvider";
import { HouseholdProvider } from "@/providers/HouseholdProvider";
import { NotificationsProvider } from "@/providers/NotificationsProvider";
import { FontScaleProvider } from "@/providers/FontScaleProvider";
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
        <Stack.Screen name="create-home" />
        <Stack.Screen name="join-home" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="item" />
        <Stack.Screen name="trip" />
        <Stack.Screen name="staples" />
        <Stack.Screen name="legal" />
      </Stack>
    </>
  );
}

function UpdateGate() {
  const [release, setRelease] = useState<"checking" | "ok" | { downloadUrl: string | null }>(
    "checking",
  );

  useEffect(() => {
    let active = true;
    void requiredAppUpdate().then((update) => {
      if (!active) return;
      setRelease(update ?? "ok");
    });
    return () => {
      active = false;
    };
  }, []);

  if (release === "checking") return <LoadingScreen />;
  if (release !== "ok") return <ForceUpdate downloadUrl={release.downloadUrl} />;
  return <ThemedNavigation />;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ReadexPro_400Regular,
    ReadexPro_500Medium,
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
  });

  if (!fontsLoaded && !fontError) return null;

  return (
    <LanguageProvider>
      <FontScaleProvider>
        <ThemeProvider>
          <AuthProvider>
            <NotificationsProvider>
              <HouseholdProvider>
                <CategoriesProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <BlurScreen>
                    <TabBlurProvider>
                      <UpdateGate />
                    </TabBlurProvider>
                  </BlurScreen>
                </GestureHandlerRootView>
                </CategoriesProvider>
              </HouseholdProvider>
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </FontScaleProvider>
    </LanguageProvider>
  );
}
