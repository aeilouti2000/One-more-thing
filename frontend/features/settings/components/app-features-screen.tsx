import { Fragment } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import {
  CardBlock,
  SettingsCardIcon,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import { APP_FEATURES } from "@/features/settings/data/about-content";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { installedAppVersion } from "@/lib/app-release";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** About → App features: what the app can do, one card per group. */
export default function AppFeaturesScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const version = installedAppVersion();

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("appFeatures")}
        subtitle={t("appFeaturesBody")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      {APP_FEATURES.map((group, groupIndex) => (
        <View key={group.id} className={groupIndex === 0 ? "" : "mt-6"}>
          <AppText className="mb-2.5 px-1 text-xs font-bold uppercase tracking-widest text-cove-muted">
            {t(group.title)}
          </AppText>
          <SettingsSection>
            <CardBlock>
              {group.features.map((feature, index) => (
                <Fragment key={feature.id}>
                  {index > 0 ? (
                    <View
                      className="my-3"
                      style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }}
                    />
                  ) : null}
                  <View className="flex-row items-start gap-3">
                    <SettingsCardIcon
                      icon={feature.icon}
                      communityIcon={feature.communityIcon}
                      colors={colors}
                    />
                    <View className="min-w-0 flex-1">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <AppText className="text-base font-semibold text-cove-ink">
                          {t(feature.title)}
                        </AppText>
                        {feature.since === version ? <NewTag label={t("featureNew")} /> : null}
                      </View>
                      <AppText className="mt-1 text-sm leading-5 text-cove-muted">
                        {t(feature.body)}
                      </AppText>
                    </View>
                  </View>
                </Fragment>
              ))}
            </CardBlock>
          </SettingsSection>
        </View>
      ))}
    </Screen>
  );
}

export function NewTag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View className="rounded-lg px-2 py-0.5" style={{ backgroundColor: colors.mist }}>
      <AppText className="text-xs font-semibold" style={{ color: colors.accentText }}>
        {label}
      </AppText>
    </View>
  );
}
