import { useEffect, useState } from "react";
import { AppState, Linking, Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { updateNotificationSettings } from "@/features/homes/api/homes";
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
  const { household, adoptHome } = useHousehold();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    canUsePush() ? (readPushEnabled() ? "on" : "off") : "unsupported",
  );
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const [isSavingHome, setIsSavingHome] = useState(false);
  const [homeError, setHomeError] = useState<string | null>(null);

  const isHost =
    household?.members.some((member) => member.id === user?.id && member.role === "owner") === true;
  const homeEnabled = household?.notificationsEnabled !== false;

  // Read the real state, and again when coming back from the phone's settings.
  useEffect(() => {
    if (!user || !canUsePush() || !readPushEnabled()) return;
    const check = () => void syncPushRegistration(locale).then(setPushStatus);
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => subscription.remove();
  }, [locale, user]);

  async function onTogglePush(enabled: boolean) {
    setIsUpdatingPush(true);
    writePushEnabled(enabled);
    if (!enabled) {
      await unregisterPushDevice();
      setPushStatus("off");
      setIsUpdatingPush(false);
      return;
    }
    // The user asked for it, so the phone's permission prompt may show now.
    setPushStatus(await syncPushRegistration(locale, { prompt: true }));
    setIsUpdatingPush(false);
  }

  async function onToggleHome(enabled: boolean) {
    if (!household || !isHost) return;
    const previous = household;
    adoptHome({ ...household, notificationsEnabled: enabled });
    setIsSavingHome(true);
    setHomeError(null);
    const result = await updateNotificationSettings(previous.id, enabled);
    setIsSavingHome(false);
    if (result.error || !result.home) {
      adoptHome(previous);
      setHomeError(result.error ?? t("errorGeneric"));
      return;
    }
    adoptHome(result.home);
  }

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
        subtitle={t("notificationsSubtitle")}
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
                    <AppText className="text-sm font-semibold text-cove-accent">
                      {t("openPhoneSettings")}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            </View>
            {pushStatus === "unsupported" ? null : (
              <Switch
                value={pushStatus === "on" || pushStatus === "error"}
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

        {household ? (
          <CardBlock>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1 flex-row items-center gap-3">
                <SettingsCardIcon icon="home-outline" colors={colors} />
                <SettingsCardCopy
                  title={t("homeAlerts", { home: household.name })}
                  body={t("homeAlertsBody")}
                />
              </View>
              <Switch
                value={homeEnabled}
                disabled={!isHost || isSavingHome}
                onValueChange={(enabled) => void onToggleHome(enabled)}
                trackColor={{ false: colors.mist, true: colors.accent }}
                thumbColor={colors.white}
                accessibilityLabel={t("homeAlerts", { home: household.name })}
              />
            </View>
            {!isHost ? (
              <AppText className="mt-3 text-xs text-cove-muted">{t("homeAlertsHostOnly")}</AppText>
            ) : null}
            <FormMessage message={homeError} />
          </CardBlock>
        ) : null}
      </SettingsSection>
    </Screen>
  );
}
