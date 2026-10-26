import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsSection, SwipeActionSettings } from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";

export default function SwipeActionsSettingsScreen() {
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("swipeActions")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <SwipeActionSettings />
      </SettingsSection>
    </Screen>
  );
}
