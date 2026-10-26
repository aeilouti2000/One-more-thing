import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { headerIconFrameStyle } from "@/constants/theme";
import {
  SettingsNavList,
  SettingsWidePlaceholder,
} from "@/features/settings/components/settings-nav-list";
import { useWideLayout } from "@/hooks/use-wide-layout";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function SettingsScreen() {
  const wide = useWideLayout();
  const { colors, scheme } = useTheme();
  const { t } = useI18n();

  // On fold, the hub lives in the left master pane; stack index is a placeholder.
  if (wide) {
    return (
      <Screen scroll={false} tabBarInset>
        <SettingsWidePlaceholder />
      </Screen>
    );
  }

  return (
    <Screen tabBarInset>
      <ScreenHeader
        title={t("settingsTitle")}
        subtitle={t("settingsSubtitle")}
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
