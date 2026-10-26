import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { headerIconFrameStyle } from "@/constants/theme";
import { SettingsNavList } from "@/features/settings/components/settings-nav-list";
import { useSettingsSplitJoin } from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Persistent left column for settings on wide/fold layouts. */
export function SettingsMasterPane() {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const splitJoin = useSettingsSplitJoin("master");

  return (
    <Screen tabBarInset>
      <ScreenHeader
        title={t("settingsTitle")}
        subtitle={t("settingsSubtitle")}
        splitJoin={splitJoin}
        icon={
          <View
            className="items-center justify-center"
            style={headerIconFrameStyle(scheme, colors)}
          >
            <Ionicons
              name="settings-outline"
              size={34}
              color={scheme === "dark" ? colors.ink : colors.onAccent}
            />
          </View>
        }
      />
      <SettingsNavList />
    </Screen>
  );
}
