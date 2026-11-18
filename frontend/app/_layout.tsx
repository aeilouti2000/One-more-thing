import "./global.css";
import { useEffect, useRef, useState } from "react";
import {
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
  ReadexPro_700Bold,
  useFonts,
} from "@expo-google-fonts/readex-pro";
import { AppState, Modal, Platform } from "react-native";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { BlurScreen } from "@/components/ui/BlurBackdrop";
import { DragOverlayProvider } from "@/components/ui/DragOverlay";
import { TabBlurProvider } from "@/components/ui/TabBlurTarget";
import { ForceUpdate } from "@/components/ui/ForceUpdate";
import { LaunchIntro } from "@/components/ui/LaunchIntro";
import { ProblemScreen } from "@/components/ui/ProblemScreen";
import { translate } from "@/constants/i18n";
import { clearCurrentProfileCache } from "@/features/offline/profile-cache";
import { logError } from "@/lib/errors";
import {
  checkAppUpdate,
  dismissAppUpdate,
  resetAppUpdateDismissal,
  type AppUpdate,
} from "@/lib/app-release";
import { AuthProvider, useAuth } from "@/features/auth/providers/auth-provider";
import { CategoriesProvider } from "@/features/items/providers/categories-provider";
import { PurchasesProvider, usePurchasesData } from "@/features/items/hooks/use-purchases";
import { HouseholdProvider } from "@/features/homes/providers/household-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { NotificationsProvider } from "@/features/notifications/providers/notifications-provider";
import { FontScaleProvider } from "@/providers/FontScaleProvider";
import { LanguageProvider } from "@/providers/LanguageProvider";
import { ThemeProvider, useTheme } from "@/providers/ThemeProvider";

function ThemedNavigation() {
  const { colors, scheme } = useTheme();

  const deeper = {
    animation: Platform.OS === "android" ? "ios_from_right" : "slide_from_right",
    fullScreenGestureShadowEnabled: false,
  } as const;

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
        <Stack.Screen name="trip" />
        <Stack.Screen name="pins" options={{ animation: "fade" }} />
        {/* Going deeper slides in from the side; changing context fades. */}
        <Stack.Screen name="legal" options={deeper} />
      </Stack>
    </>
  );
}

/**
 * Coming back after this long counts as opening the app again. Shorter trips
 * (the camera, the photo picker, a share sheet) don't bring the prompt back.
 */
const REOPEN_AFTER_MS = 15_000;

function UpdateGate() {
  const [release, setRelease] = useState<AppUpdate | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const check = () => {
      void checkAppUpdate().then((update) => {
        if (active && update) setRelease(update);
      });
    };
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt.current = Date.now();
        return;
      }
      if (state !== "active" || backgroundedAt.current === null) return;
      const away = Date.now() - backgroundedAt.current;
      backgroundedAt.current = null;
      if (away < REOPEN_AFTER_MS) return;
      resetAppUpdateDismissal();
      check();
    });
    return () => {
      active = false;
      subscription.remove();
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

/** The launch intro bursts once the first real screen has what it needs. */
function AppLaunchIntro() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const { isLoading: isHomeLoading } = useHousehold();
  const { isLoading: isItemsLoading } = usePurchasesData();
  const ready = !isAuthLoading && (!user || (!isHomeLoading && !isItemsLoading));
  return <LaunchIntro ready={ready} />;
}

/**
 * Shown instead of a blank app when rendering fails anywhere. The providers
 * below are not available here, so it uses only what needs none.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    logError("render", error);
    // The launch intro may never have run, so make sure the splash goes.
    void SplashScreen.hideAsync();
  }, [error]);

  return (
    <ProblemScreen
      title={translate("crashTitle")}
      body={translate("crashBody")}
      primaryLabel={translate("tryAgain")}
      onPrimary={() => void retry()}
      // Saved data from an older version can be what breaks the page.
      secondaryLabel={translate("crashClearAndRetry")}
      onSecondary={() => {
        clearCurrentProfileCache();
        void retry();
      }}
    />
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
            <HouseholdProvider>
              <NotificationsProvider>
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
                  <AppLaunchIntro />
                </GestureHandlerRootView>
                </PurchasesProvider>
                </CategoriesProvider>
              </NotificationsProvider>
            </HouseholdProvider>
          </AuthProvider>
        </ThemeProvider>
      </FontScaleProvider>
    </LanguageProvider>
  );
}
