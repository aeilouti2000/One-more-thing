import "./global.css";
import { useEffect, useState } from "react";
import {
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
  ReadexPro_700Bold,
  useFonts,
} from "@expo-google-fonts/readex-pro";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { BlurScreen } from "@/components/ui/BlurBackdrop";
import { DragOverlayProvider } from "@/components/ui/DragOverlay";
import { TabBlurProvider } from "@/components/ui/TabBlurTarget";
import { ForceUpdate } from "@/components/ui/ForceUpdate";
import { requiredAppUpdate } from "@/lib/app-release";
import { AuthProvider } from "@/features/auth/providers/auth-provider";
import { CategoriesProvider } from "@/features/items/providers/categories-provider";
import { PurchasesProvider } from "@/features/items/hooks/use-purchases";
import { HouseholdProvider } from "@/features/homes/providers/household-provider";
import { NotificationsProvider } from "@/features/notifications/providers/notifications-provider";
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
        <Stack.Screen name="pins" options={{ animation: "fade" }} />
        <Stack.Screen
          name="categories"
          options={{
            animation:
              Platform.OS === "android" ? "ios_from_right" : "slide_from_right",
            fullScreenGestureShadowEnabled: false,
          }}
        />
        <Stack.Screen name="legal" />
      </Stack>
    </>
  );
}

function UpdateGate() {
  const [release, setRelease] = useState<{ downloadUrl: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    void requiredAppUpdate().then((update) => {
      if (!active || !update) return;
      setRelease(update);
    });
    return () => {
      active = false;
    };
  }, []);

  if (release) return <ForceUpdate downloadUrl={release.downloadUrl} />;
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
                <PurchasesProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <DragOverlayProvider>
                    <BlurScreen>
                      <TabBlurProvider>
                        <UpdateGate />
                      </TabBlurProvider>
                    </BlurScreen>
                  </DragOverlayProvider>
                </GestureHandlerRootView>
                </PurchasesProvider>
                </CategoriesProvider>
              </HouseholdProvider>
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </FontScaleProvider>
    </LanguageProvider>
  );
}
