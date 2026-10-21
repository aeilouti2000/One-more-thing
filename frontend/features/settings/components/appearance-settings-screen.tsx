import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FontSizeBar } from "@/components/ui/FontSizeBar";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { ThemeColorPicker } from "@/components/ui/ThemeColorPicker";
import {
  CardBlock,
  SettingsCardIcon,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function AppearanceSettingsScreen() {
  const { t } = useI18n();
  const { colors, scheme, setScheme } = useTheme();

  return (
    <Screen>
      <ScreenHeader
        title={t("appearance")}
        subtitle={`${scheme === "dark" ? t("dark") : t("light")} · ${t("textSize")}`}
        showBack
      />

      <SettingsSection>
        <CardBlock>
          <View className="mb-3 flex-row items-center gap-3">
            <SettingsCardIcon icon="moon-outline" colors={colors} />
            <AppText className="text-base font-semibold text-cove-ink">{t("theme")}</AppText>
          </View>
          <SegmentedToggle
            value={scheme}
            options={[
              { id: "light", label: t("light") },
              { id: "dark", label: t("dark") },
            ]}
            onChange={setScheme}
            accessibilityLabel={t("theme")}
          />
          <View className="mt-5">
            <ThemeColorPicker />
          </View>
        </CardBlock>

        <CardBlock>
          <View className="mb-3 flex-row items-center gap-3">
            <SettingsCardIcon icon="text-outline" colors={colors} />
            <AppText className="text-base font-semibold text-cove-ink">
              {t("textSize")}
            </AppText>
          </View>
          <FontSizeBar />
        </CardBlock>
      </SettingsSection>
    </Screen>
  );
}
