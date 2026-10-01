import { router } from "expo-router";
import { useEffect, type ReactNode } from "react";
import { AppState } from "react-native";
import { emitListChanged } from "@/lib/list-sync";
import { canUsePush, loadNotifications, readPushEnabled, syncPushRegistration } from "@/lib/push";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { locale } = useI18n();

  useEffect(() => {
    if (!canUsePush()) return;

    void loadNotifications().then((Notifications) => {
      if (!Notifications) return;
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
    if (!canUsePush()) return;

    let received: { remove: () => void } | null = null;
    let response: { remove: () => void } | null = null;
    let cancelled = false;

    void loadNotifications().then((Notifications) => {
      if (cancelled || !Notifications) return;
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
