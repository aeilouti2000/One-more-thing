import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { View } from "react-native";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LOCALES } from "@/constants/i18n";
import { headerIconFrameStyle } from "@/constants/theme";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { SettingsNavCard } from "@/features/settings/components/settings-ui";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function SettingsScreen() {
  const { user } = useAuth();
  const { household } = useHousehold();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();

  const displayName = user?.name?.trim() || t("member");
  const languageLabel = LOCALES.find((item) => item.id === locale)?.label ?? t("language");
  const costsSummary = household?.costsEnabled ? t("trackCosts") : t("costsSectionBody");

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

      <View className="gap-3">
        <SettingsNavCard
          icon="person-outline"
          title={t("account")}
          summary={displayName}
          onPress={() => router.push("/settings/account" as Href)}
          colors={colors}
        />
        <SettingsNavCard
          icon="options-outline"
          title={t("appSettings")}
          summary={`${t("categories")} · ${t("pinsTitle")} · ${t("listAlerts")}`}
          onPress={() => router.push("/settings/app" as Href)}
          colors={colors}
        />
        {household ? (
          <SettingsNavCard
            icon="cash-outline"
            title={t("costsSection")}
            summary={costsSummary}
            onPress={() => router.push("/settings/costs" as Href)}
            colors={colors}
          />
        ) : null}
        <SettingsNavCard
          icon="language-outline"
          title={t("languageLabel")}
          summary={languageLabel}
          onPress={() => router.push("/settings/language" as Href)}
          colors={colors}
        />
        <SettingsNavCard
          icon="color-palette-outline"
          title={t("appearance")}
          summary={`${scheme === "dark" ? t("dark") : t("light")} · ${t("textSize")}`}
          onPress={() => router.push("/settings/appearance" as Href)}
          colors={colors}
        />
      </View>
    </Screen>
  );
}
