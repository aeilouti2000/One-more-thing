import { useEffect, useState } from "react";
import { AppState, Linking, Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
  canUsePush,
  readPushEnabled,
  syncPushRegistration,
  unregisterPushDevice,
  writePushEnabled,
  type PushStatus,
} from "@/features/notifications/api/push";
import {
  fetchNotificationPrefs,
  NOTIFICATION_KINDS,
  readCachedNotificationPrefs,
  updateNotificationPrefs,
  type NotificationKind,
  type NotificationPrefs,
} from "@/features/notifications/api/preferences";
import {
  CardBlock,
  SettingsCardCopy,
  SettingsCardIcon,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function NotificationsSettingsScreen() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    canUsePush() ? (readPushEnabled() ? "on" : "off") : "unsupported",
  );
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(readCachedNotificationPrefs);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const homeEnabled = household?.notificationsEnabled !== false;

  // Read the real state, and again when coming back from the phone's settings.
  useEffect(() => {
    if (!user || !canUsePush()) return;
    // Checked each time: the switch may have been turned on since this ran.
    const check = () => {
      if (!readPushEnabled()) return;
      void syncPushRegistration(locale).then(setPushStatus);
    };
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, [locale, user]);

  async function onTogglePush(enabled: boolean) {
    setIsUpdatingPush(true);
    writePushEnabled(enabled);
    setPrefsError(null);
    if (!enabled) {
      const removed = await unregisterPushDevice();
      if (!removed) {
        // The server still has this phone: say so instead of showing "off".
        writePushEnabled(true);
        setPrefsError(t("errorNetwork"));
      } else {
        setPushStatus("off");
      }
      setIsUpdatingPush(false);
      return;
    }
    // The user asked for it, so the phone's permission prompt may show now.
    setPushStatus(await syncPushRegistration(locale, { prompt: true }));
    setIsUpdatingPush(false);
  }

  // The choices follow the account, so another phone may have changed them.
  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetchNotificationPrefs().then((result) => {
      if (active && result.prefs) setPrefs(result.prefs);
    });
    return () => {
      active = false;
    };
  }, [user]);

  async function onToggleKind(kind: NotificationKind, enabled: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [kind]: enabled });
    setPrefsError(null);
    const result = await updateNotificationPrefs({ [kind]: enabled });
    if (result.error || !result.prefs) {
      setPrefs(previous);
      setPrefsError(result.error ?? t("errorGeneric"));
      return;
    }
    setPrefs(result.prefs);
  }

  const kindCopy: Record<
    NotificationKind,
    {
      icon:
        | "add-circle-outline"
        | "alert-circle-outline"
        | "pin-outline"
        | "chatbubbles-outline"
        | "hourglass-outline";
      title: string;
      body: string;
    }
  > = {
    added: { icon: "add-circle-outline", title: t("notifyAdded"), body: t("notifyAddedBody") },
    urgent: { icon: "alert-circle-outline", title: t("notifyUrgent"), body: t("notifyUrgentBody") },
    shopping: {
      icon: "chatbubbles-outline",
      title: t("notifyShopping"),
      body: t("notifyShoppingBody"),
    },
    due: { icon: "pin-outline", title: t("notifyDue"), body: t("notifyDueBody") },
    later: { icon: "hourglass-outline", title: t("notifyLater"), body: t("notifyLaterBody") },
  };
  const phoneOn = pushStatus === "on" || pushStatus === "error";
  // The choices follow the account, so they still matter where this device
  // can't get notifications itself (the web, Expo Go).
  const kindsActive = phoneOn || pushStatus === "unsupported";

  const phoneBody =
    pushStatus === "unsupported"
      ? t("notificationsPhoneOnly")
      : pushStatus === "denied"
        ? t("notificationsDenied")
        : pushStatus === "error"
          ? t("notificationsRetry")
          : t("myAlertsBody");

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("notificationsTitle")}
        subtitle={t("preferencesSubtitle")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <CardBlock>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <SettingsCardIcon icon="phone-portrait-outline" colors={colors} />
              <View className="min-w-0 flex-1">
                <SettingsCardCopy title={t("myAlerts")} body={phoneBody} />
                {pushStatus === "denied" ? (
                  <Pressable
                    onPress={() => void Linking.openSettings()}
                    className="mt-3 self-start active:opacity-80"
                  >
                    <AppText className="text-sm font-semibold text-cove-accent-text">
                      {t("openPhoneSettings")}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {pushStatus === "unsupported" ? null : (
              <Switch
                value={phoneOn}
                disabled={isUpdatingPush || pushStatus === "denied"}
                onValueChange={(enabled) => void onTogglePush(enabled)}
                trackColor={{ false: colors.mist, true: colors.accent }}
                thumbColor={colors.white}
                accessibilityLabel={t("myAlerts")}
              />
            )}
          </View>
          {!homeEnabled && pushStatus === "on" ? (
            <AppText className="mt-3 text-xs text-cove-muted">{t("homeAlertsOffNote")}</AppText>
          ) : null}
        </CardBlock>

        <CardBlock>
          <AppText className="text-base font-semibold text-cove-ink">{t("notifyKindsTitle")}</AppText>
            <AppText className="mt-1 text-sm text-cove-muted">
              {kindsActive ? t("notifyKindsBody") : t("notifyKindsOff")}
            </AppText>
            {NOTIFICATION_KINDS.map((kind) => (
              <View
                key={kind}
                className="mt-4 flex-row items-center justify-between gap-3"
                style={{ opacity: kindsActive ? 1 : 0.5 }}
              >
                <View className="min-w-0 flex-1 flex-row items-center gap-3">
                  <SettingsCardIcon
                    icon={kindCopy[kind].icon}
                    communityIcon={kind === "due" ? "pin" : undefined}
                    colors={colors}
                  />
                  <SettingsCardCopy title={kindCopy[kind].title} body={kindCopy[kind].body} />
                </View>
                <Switch
                  value={prefs[kind]}
                  disabled={!kindsActive}
                  onValueChange={(enabled) => void onToggleKind(kind, enabled)}
                  trackColor={{ false: colors.mist, true: colors.accent }}
                  thumbColor={colors.white}
                  accessibilityLabel={kindCopy[kind].title}
                />
              </View>
            ))}
            <FormMessage message={prefsError} />
          </CardBlock>
      </SettingsSection>
    </Screen>
  );
}
