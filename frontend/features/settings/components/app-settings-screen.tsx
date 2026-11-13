import { router, type Href } from "expo-router";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
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
  const { colors } = useTheme();
  const { household } = useHousehold();
  const { t } = useI18n();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("appSettings")}
        subtitle={`${t("categories")} · ${t("pinsTitle")} · ${t("costsSection")}`}
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

        {household ? (
          <SettingsLinkCard
            icon="cash-outline"
            title={t("costsSection")}
            body={household.costsEnabled ? t("trackCosts") : t("costsSectionBody")}
            onPress={() => router.push("/settings/costs" as Href)}
            colors={colors}
          />
        ) : null}
      </SettingsSection>
    </Screen>
  );
}
