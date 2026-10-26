import { router, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/features/auth/providers/auth-provider";
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
  SettingsLinkCard,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function AppSettingsScreen() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    canUsePush() ? (readPushEnabled() ? "on" : "off") : "unsupported",
  );
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);

  useEffect(() => {
    if (!user || !canUsePush() || !readPushEnabled()) return;
    void syncPushRegistration(locale).then(setPushStatus);
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
    setPushStatus(await syncPushRegistration(locale));
    setIsUpdatingPush(false);
  }

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("appSettings")}
        subtitle={`${t("categories")} · ${t("pinsTitle")} · ${t("listAlerts")}`}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <SettingsLinkCard
          icon="grid-outline"
          title={t("categories")}
          body={t("categoriesSettingsBody")}
          onPress={() => router.push("/settings/categories" as Href)}
          colors={colors}
        />

        <SettingsLinkCard
          icon="swap-horizontal-outline"
          title={t("swipeActions")}
          body={t("swipeActionsBody")}
          onPress={() => router.push("/settings/swipe-actions" as Href)}
          colors={colors}
        />

        <SettingsLinkCard
          icon="pin-outline"
          title={t("pinsTitle")}
          body={t("pinsSubtitle")}
          onPress={() => router.push("/settings/pins" as Href)}
          colors={colors}
        />

        <CardBlock>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <SettingsCardIcon icon="notifications-outline" colors={colors} />
              <View className="min-w-0 flex-1">
                <SettingsCardCopy
                  title={t("listAlerts")}
                  body={
                    pushStatus === "unsupported"
                      ? t("notificationsPhoneOnly")
                      : pushStatus === "denied"
                        ? t("notificationsDenied")
                        : t("listAlertsBody")
                  }
                />
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
                value={pushStatus === "on"}
                disabled={isUpdatingPush || pushStatus === "denied"}
                onValueChange={(enabled) => void onTogglePush(enabled)}
                trackColor={{ false: colors.mist, true: colors.accent }}
                thumbColor={colors.white}
              />
            )}
          </View>
        </CardBlock>
      </SettingsSection>
    </Screen>
  );
}
