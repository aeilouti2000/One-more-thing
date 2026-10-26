import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { LanguagePicker } from "@/components/ui/LanguagePicker";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { withAlpha } from "@/constants/theme";
import { CardBlock, SettingsSection } from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function LanguageSettingsScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("languagePageTitle")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <View className="items-center overflow-hidden rounded-3xl bg-cove-paper px-5 py-8">
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: 96,
              height: 96,
              backgroundColor: withAlpha(colors.accent, 0.1),
            }}
          >
            <View
              className="items-center justify-center rounded-full"
              style={{
                width: 72,
                height: 72,
                backgroundColor: withAlpha(colors.accent, 0.18),
              }}
            >
              <Ionicons name="language-outline" size={34} color={colors.accent} />
            </View>
          </View>
          <AppText className="mt-5 text-center text-xl font-semibold text-cove-ink">
            {t("interfaceLanguage")}
          </AppText>
          <AppText className="mt-2 text-center text-sm text-cove-muted">
            {t("interfaceLanguageBody")}
          </AppText>
        </View>

        <CardBlock>
          <LanguagePicker />
        </CardBlock>
      </SettingsSection>
    </Screen>
  );
}
