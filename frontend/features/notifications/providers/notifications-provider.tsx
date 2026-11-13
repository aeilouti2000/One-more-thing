import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { switchHome } from "@/features/homes/api/homes";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { writeStoredListId } from "@/features/items/utils/list-storage";
import { emitFocusList, emitListChanged } from "@/features/items/utils/list-sync";
import {
  canUsePush,
  loadNotifications,
  readPushEnabled,
  syncPushRegistration,
  type PushStatus,
} from "@/features/notifications/api/push";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useI18n } from "@/providers/LanguageProvider";

type Opened = { id: string; homeId: string | null; listId: string | null };

/** Tapped notifications already handled (the cold-start one can also arrive via the listener). */
const handled = new Set<string>();

function readOpened(response: {
  notification: { request: { identifier: string; content: { data?: unknown } } };
}): Opened | null {
  const id = response.notification.request.identifier;
  if (handled.has(id)) return null;
  handled.add(id);
  const data = (response.notification.request.content.data ?? {}) as Record<string, unknown>;
  return {
    id,
    homeId: typeof data.homeId === "string" ? data.homeId : null,
    listId: typeof data.listId === "string" ? data.listId : null,
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { household, isLoading: isHouseholdLoading, adoptHome, refresh } = useHousehold();
  const { locale } = useI18n();
  // The tapped notification waits here until sign-in and the home have loaded.
  const opened = useRef<Opened | null>(null);
  const [openSignal, setOpenSignal] = useState(0);
  const status = useRef<PushStatus | null>(null);
  const userId = user?.id ?? null;

  const sync = useCallback(async () => {
    if (!userId || !readPushEnabled()) return;
    // Never prompts here: the phone's prompt only follows a user's choice.
    status.current = await syncPushRegistration(locale);
  }, [locale, userId]);

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
    void sync();
  }, [sync]);

  // Retry a failed registration, and pick up permission granted in phone settings.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      emitListChanged();
      if (status.current !== "on") void sync();
    });
    return () => subscription.remove();
  }, [sync]);

  useEffect(() => {
    if (!canUsePush()) return;

    let received: { remove: () => void } | null = null;
    let response: { remove: () => void } | null = null;
    let tokenChanged: { remove: () => void } | null = null;
    let cancelled = false;

    void loadNotifications().then(async (Notifications) => {
      if (cancelled || !Notifications) return;
      received = Notifications.addNotificationReceivedListener(() => {
        emitListChanged();
      });
      response = Notifications.addNotificationResponseReceivedListener((event) => {
        const next = readOpened(event);
        if (!next) return;
        opened.current = next;
        setOpenSignal((value) => value + 1);
      });
      // The phone's push token can rotate while the app runs. Reading the token
      // (as sync does) also fires this event, so only react to a real change,
      // or every sync would start another one.
      let lastDeviceToken: string | null = null;
      tokenChanged = Notifications.addPushTokenListener((event) => {
        const next = typeof event.data === "string" ? event.data : JSON.stringify(event.data);
        const changed = lastDeviceToken !== null && next !== lastDeviceToken;
        lastDeviceToken = next;
        if (!changed) return;
        status.current = null;
        void sync();
      });

      // The tap that launched a closed app happens before these listeners exist.
      const launch = await Notifications.getLastNotificationResponseAsync().catch(() => null);
      if (cancelled || !launch) return;
      const next = readOpened(launch);
      if (next) {
        opened.current = next;
        setOpenSignal((value) => value + 1);
      }
      void Notifications.clearLastNotificationResponseAsync?.().catch(() => undefined);
    });

    return () => {
      cancelled = true;
      received?.remove();
      response?.remove();
      tokenChanged?.remove();
    };
  }, [sync]);

  // Open the home and list the notification is about, once signed in and loaded.
  useEffect(() => {
    const target = opened.current;
    if (!target || !userId || isHouseholdLoading) return;
    opened.current = null;

    void (async () => {
      let homeId = household?.id ?? null;
      if (target.homeId && household && target.homeId !== household.id) {
        const result = await switchHome(target.homeId);
        if (result.home) {
          adoptHome(result.home);
          homeId = result.home.id;
          void refresh();
        }
      }
      if (target.listId && homeId && homeId === target.homeId) {
        writeStoredListId(homeId, target.listId);
        emitFocusList(homeId, target.listId);
      }
      emitListChanged();
      try {
        router.push("/(tabs)/items");
      } catch {
        // Navigation not mounted yet; the list still refreshed.
      }
    })();
  }, [adoptHome, household, isHouseholdLoading, openSignal, refresh, userId]);

  return children;
}
