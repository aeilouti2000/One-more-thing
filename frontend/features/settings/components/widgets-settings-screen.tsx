import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { AppState, Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import type { TranslationKey } from "@/constants/i18n";
import {
  CardBlock,
  SettingsCardCopy,
  SettingsCardIcon,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { readWidgetBackground, writeWidgetBackground } from "@/features/widgets/widget-prefs";
import {
  readWidgetStatus,
  requestWidgetPin,
  type WidgetKind,
  type WidgetStatus,
} from "@/modules/home-widgets/src";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const WIDGETS: {
  kind: WidgetKind;
  icon: keyof typeof Ionicons.glyphMap;
  communityIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  title: TranslationKey;
  body: TranslationKey;
}[] = [
  { kind: "list", icon: "list-outline", title: "widgetListName", body: "widgetListBody" },
  { kind: "budget", icon: "pie-chart-outline", title: "widgetBudgetName", body: "widgetBudgetBody" },
  {
    kind: "pins",
    icon: "bookmark-outline",
    communityIcon: "pin-outline",
    title: "widgetPinsName",
    body: "widgetPinsBody",
  },
  { kind: "pulse", icon: "pulse-outline", title: "widgetPulseName", body: "widgetPulseBody" },
];

/** Preferences → Widgets: add them to the home screen, and how they stay fresh. */
export default function WidgetsSettingsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [status, setStatus] = useState<WidgetStatus | null>(readWidgetStatus);
  const [background, setBackground] = useState(readWidgetBackground);

  // The phone's "add widget" prompt covers the app; read the counts again after it.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setStatus(readWidgetStatus());
    });
    return () => subscription.remove();
  }, []);

  function onBackground(enabled: boolean) {
    setBackground(enabled);
    writeWidgetBackground(enabled);
  }

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("widgetsTitle")}
        subtitle={t("widgetsSubtitle")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        {WIDGETS.map((widget) => {
          const placed = (status?.[widget.kind] ?? 0) > 0;
          return (
            <CardBlock key={widget.kind}>
              <View className="flex-row items-center gap-3">
                <SettingsCardIcon
                  icon={widget.icon}
                  communityIcon={widget.communityIcon}
                  colors={colors}
                />
                <SettingsCardCopy
                  title={t(widget.title)}
                  body={placed ? `${t(widget.body)} ${t("widgetOnScreen")}.` : t(widget.body)}
                />
                {status?.canPin ? (
                  <Pressable
                    onPress={() => requestWidgetPin(widget.kind)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t("widgetAddLabel", { name: t(widget.title) })}
                    className="rounded-full px-4 py-2 active:opacity-80"
                    style={{ backgroundColor: placed ? colors.mist : colors.accent }}
                  >
                    <AppText
                      className="text-sm font-semibold"
                      style={{ color: placed ? colors.accentText : colors.onAccent }}
                    >
                      {t("widgetAdd")}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            </CardBlock>
          );
        })}

        <CardBlock>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <SettingsCardIcon icon="sync-outline" colors={colors} />
              <SettingsCardCopy title={t("widgetsBackground")} body={t("widgetsBackgroundBody")} />
            </View>
            <Switch
              value={background}
              onValueChange={onBackground}
              trackColor={{ false: colors.mist, true: colors.accent }}
              thumbColor={colors.white}
              accessibilityLabel={t("widgetsBackground")}
            />
          </View>
        </CardBlock>

        <AppText className="px-1 text-xs leading-5 text-cove-muted">
          {`${t("widgetsHowTitle")}: ${t("widgetsHowBody")}`}
        </AppText>
      </SettingsSection>
    </Screen>
  );
}
