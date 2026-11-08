import "./global.css";
import { useEffect, useState } from "react";
import {
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
  ReadexPro_700Bold,
  useFonts,
} from "@expo-google-fonts/readex-pro";
import { Modal, Platform } from "react-native";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { BlurScreen } from "@/components/ui/BlurBackdrop";
import { DragOverlayProvider } from "@/components/ui/DragOverlay";
import { TabBlurProvider } from "@/components/ui/TabBlurTarget";
import { ForceUpdate } from "@/components/ui/ForceUpdate";
import { checkAppUpdate, dismissAppUpdate, type AppUpdate } from "@/lib/app-release";
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
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="verify-email" />
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
  const [release, setRelease] = useState<AppUpdate | null>(null);

  useEffect(() => {
    let active = true;
    void checkAppUpdate().then((update) => {
      if (!active || !update) return;
      setRelease(update);
    });
    return () => {
      active = false;
    };
  }, []);

  if (release?.required) {
    return <ForceUpdate downloadUrl={release.downloadUrl} />;
  }
  const later = () => {
    if (!release) return;
    dismissAppUpdate(release.version);
    setRelease(null);
  };
  // An optional update shows over the app, so whatever the user already
  // opened or typed is still there after "Later".
  return (
    <>
      <ThemedNavigation />
      <Modal
        visible={release !== null}
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={later}
      >
        {release ? <ForceUpdate downloadUrl={release.downloadUrl} onLater={later} /> : null}
      </Modal>
    </>
  );
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
