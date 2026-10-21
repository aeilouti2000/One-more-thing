import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SettingsSection, SwipeActionSettings } from "@/features/settings/components/settings-ui";
import { useI18n } from "@/providers/LanguageProvider";

export default function SwipeActionsSettingsScreen() {
  const { t } = useI18n();

  return (
    <Screen>
      <ScreenHeader title={t("swipeActions")} showBack />

      <SettingsSection>
        <SwipeActionSettings />
      </SettingsSection>
    </Screen>
  );
}
