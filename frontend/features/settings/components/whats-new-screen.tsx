import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { CardBlock, SettingsSection } from "@/features/settings/components/settings-ui";
import { WHATS_NEW } from "@/features/settings/data/about-content";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { installedAppVersion } from "@/lib/app-release";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** About → What's new: the release notes of the installed version. */
export default function WhatsNewScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const version = installedAppVersion();

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("whatsNewCard")}
        subtitle={t("whatsNewSubtitle", { version })}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <CardBlock>
          <View className="gap-3">
            {WHATS_NEW.map((key) => (
              <View key={key} className="flex-row items-start gap-3">
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentText} />
                <AppText className="min-w-0 flex-1 text-sm leading-5 text-cove-muted">
                  {t(key)}
                </AppText>
              </View>
            ))}
          </View>
        </CardBlock>
      </SettingsSection>
    </Screen>
  );
}
