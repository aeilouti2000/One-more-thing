import { router, usePathname, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LOCALES } from "@/constants/i18n";
import {
  readSwipeActions,
  subscribeSwipeActions,
  type SwipeActionPrefs,
} from "@/features/items/utils/swipe-actions";
import { canUsePush, readPushEnabled } from "@/features/notifications/api/push";
import { animationsLabel } from "@/features/settings/components/animations-settings-screen";
import { THEME_LABELS } from "@/features/settings/data/theme-labels";
import { canChangeAppIcon, currentAppIcon } from "@/lib/app-icon";
import {
  SettingsLinkCard,
  SettingsSection,
  swipeActionName,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { readWidgetStatus, widgetCount, widgetsAvailable } from "@/modules/home-widgets/src";
import { useI18n } from "@/providers/LanguageProvider";
import { useAnimationsSetting } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Personal choices: they follow this person, not the home. */
export default function PreferencesScreen() {
  const { colors, preference } = useTheme();
  const { t, locale } = useI18n();
  const { off: animationsOff } = useAnimationsSetting();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const pathname = usePathname();
  const [swipes, setSwipes] = useState<SwipeActionPrefs>(readSwipeActions);
  const [pushOn, setPushOn] = useState(readPushEnabled);
  const [widgets, setWidgets] = useState(() => widgetCount(readWidgetStatus()));

  useEffect(() => subscribeSwipeActions(setSwipes), []);
  // The switch lives on another page; read it again when coming back here.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-read a stored value on navigation
    setPushOn(readPushEnabled());
    setWidgets(widgetCount(readWidgetStatus()));
  }, [pathname]);

  const languageLabel = LOCALES.find((item) => item.id === locale)?.label ?? t("language");
  const appIcon = currentAppIcon();
  const appIconLabel =
    appIcon === "system" ? t("themeSystem") : appIcon === "light" ? t("light") : t("dark");
  const themeLabel = t(THEME_LABELS[preference]);

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("preferences")}
        subtitle={t("preferencesSubtitle")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <SettingsLinkCard
          icon="notifications-outline"
          title={t("notificationsTitle")}
          body={
            !canUsePush()
              ? t("notificationsPhoneOnly")
              : pushOn
                ? t("settingOn")
                : t("settingOff")
          }
          onPress={() => router.push("/settings/notifications" as Href)}
          colors={colors}
        />
        <SettingsLinkCard
          icon="swap-horizontal-outline"
          title={t("swipeActions")}
          body={`${swipeActionName(swipes.left, t)} · ${swipeActionName(swipes.right, t)}`}
          onPress={() => router.push("/settings/swipe-actions" as Href)}
          colors={colors}
        />
        <SettingsLinkCard
          icon="language-outline"
          title={t("languageLabel")}
          body={languageLabel}
          onPress={() => router.push("/settings/language" as Href)}
          colors={colors}
        />
        <SettingsLinkCard
          icon="color-palette-outline"
          title={t("appearance")}
          body={`${themeLabel} · ${t("textSize")}`}
          onPress={() => router.push("/settings/appearance" as Href)}
          colors={colors}
        />
        <SettingsLinkCard
          icon="flash-outline"
          title={t("animations")}
          body={animationsLabel(animationsOff, t)}
          onPress={() => router.push("/settings/animations" as Href)}
          colors={colors}
        />
        {canChangeAppIcon() ? (
          <SettingsLinkCard
            icon="apps-outline"
            title={t("appIcon")}
            body={appIconLabel}
            onPress={() => router.push("/settings/app-icon" as Href)}
            colors={colors}
          />
        ) : null}
        {widgetsAvailable ? (
          <SettingsLinkCard
            icon="grid-outline"
            title={t("widgetsTitle")}
            body={widgets > 0 ? t("widgetsCount", { count: widgets }) : t("widgetsNone")}
            onPress={() => router.push("/settings/widgets" as Href)}
            colors={colors}
          />
        ) : null}
      </SettingsSection>
    </Screen>
  );
}
