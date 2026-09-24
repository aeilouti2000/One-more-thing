import { router } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { AppState, Platform } from "react-native";
import { emitListChanged } from "@/lib/list-sync";
import { readPushEnabled, syncPushRegistration } from "@/lib/push";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { locale } = useI18n();

  useEffect(() => {
    if (Platform.OS === "web") return;

    void import("expo-notifications").then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    });
  }, []);

  useEffect(() => {
    if (!user || !readPushEnabled()) return;
    void syncPushRegistration(locale);
  }, [locale, user]);

  useEffect(() => {
    if (Platform.OS === "web") return;

    let received: { remove: () => void } | null = null;
    let response: { remove: () => void } | null = null;
    let cancelled = false;

    void import("expo-notifications").then((Notifications) => {
      if (cancelled) return;
      received = Notifications.addNotificationReceivedListener(() => {
        emitListChanged();
      });
      response = Notifications.addNotificationResponseReceivedListener(() => {
        emitListChanged();
        router.push("/(tabs)/items");
      });
    });

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") emitListChanged();
    });

    return () => {
      cancelled = true;
      received?.remove();
      response?.remove();
      appState.remove();
    };
  }, []);

  return children;
}
