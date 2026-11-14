import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { updateNotificationSettings } from "@/features/homes/api/homes";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
  CardBlock,
  HostOnly,
  SettingsCardCopy,
  SettingsCardIcon,
  SettingsSection,
  useHostOnlyNotice,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** The host's switch that silences list notifications for the whole home. */
export default function HomeAlertsSettingsScreen() {
  const { user } = useAuth();
  const { household, adoptHome } = useHousehold();
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const hostOnly = useHostOnlyNotice();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost =
    household?.members.some((member) => member.id === user?.id && member.role === "owner") === true;

  useEffect(() => {
    if (!household) router.back();
  }, [household]);

  if (!household) return null;

  async function onToggle(enabled: boolean) {
    if (!household || !isHost) return;
    const previous = household;
    adoptHome({ ...household, notificationsEnabled: enabled });
    setIsSaving(true);
    setError(null);
    const result = await updateNotificationSettings(previous.id, enabled);
    setIsSaving(false);
    if (result.error || !result.home) {
      adoptHome(previous);
      setError(result.error ?? t("errorGeneric"));
      return;
    }
    adoptHome(result.home);
  }

  return (
    <Screen tabBarInset={tabBarInset} floating={hostOnly.floating}>
      <ScreenHeader
        title={t("homeAlertsTitle")}
        subtitle={`${household.name} · ${t("sharedByEveryone")}`}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <CardBlock>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <SettingsCardIcon icon="home-outline" colors={colors} />
              <SettingsCardCopy
                title={t("homeAlerts", { home: household.name })}
                body={t("homeAlertsBody")}
              />
            </View>
            <HostOnly locked={!isHost} onBlocked={hostOnly.show}>
              <Switch
                value={household.notificationsEnabled}
                disabled={!isHost || isSaving}
                onValueChange={(enabled) => void onToggle(enabled)}
                trackColor={{ false: colors.mist, true: colors.accent }}
                thumbColor={colors.white}
                accessibilityLabel={t("homeAlerts", { home: household.name })}
              />
            </HostOnly>
          </View>
          {!isHost ? (
            <AppText className="mt-3 text-xs text-cove-muted">{t("homeAlertsHostOnly")}</AppText>
          ) : null}
          <FormMessage message={error} />
        </CardBlock>
      </SettingsSection>
    </Screen>
  );
}
