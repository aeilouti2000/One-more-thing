import { router, type Href } from "expo-router";
import { useEffect } from "react";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { useHistoryPeriodLabel } from "@/features/homes/components/history-period-notice";
import { historyNow, shortDate } from "@/features/homes/utils/history-period";
import { formatMoney } from "@/features/items/utils/currency";
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

/** Everything here is shared by the people in the current home. */
export default function HomeSettingsScreen() {
  const { colors } = useTheme();
  const { household } = useHousehold();
  const { t, locale } = useI18n();
  const periodLabel = useHistoryPeriodLabel();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");

  useEffect(() => {
    if (!household) router.back();
  }, [household]);

  if (!household) return null;

  const costsBody = !household.costsEnabled
    ? t("costsSectionBody")
    : household.monthlyBudget
      ? `${t("settingOn")} · ${t("budgetOf", {
          amount: formatMoney(household.monthlyBudget, household.currency),
        })}`
      : `${t("settingOn")} · ${household.currency}`;
  const tripsBody = [
    household.tripAskName ? t("tripAskName") : null,
    household.tripAutoEndHours
      ? t("tripAutoEndAfter", { hours: household.tripAutoEndHours })
      : null,
  ]
    .filter(Boolean)
    .join(" · ");
  // Missing from an older server: the setting is hidden.
  const history = household.history ? historyNow(household.history) : null;
  const historyBody = !history
    ? null
    : history.pending
      ? t("historyKeepsPending", {
          period: periodLabel(history.months),
          next: periodLabel(history.pending.months),
          date: shortDate(history.pending.from, locale),
        })
      : t("historyKeeps", { period: periodLabel(history.chosen) });

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("homeSettings")}
        subtitle={`${household.name} · ${t("sharedByEveryone")}`}
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
          icon="pin-outline"
          communityIcon="pin"
          title={t("pinsTitle")}
          body={t("pinsSubtitle")}
          onPress={() => router.push("/settings/pins" as Href)}
          colors={colors}
        />
        <SettingsLinkCard
          icon="cash-outline"
          title={t("costsAndBudget")}
          body={costsBody}
          onPress={() => router.push("/settings/costs" as Href)}
          colors={colors}
        />
        <SettingsLinkCard
          icon="cart-outline"
          title={t("tripsSettings")}
          body={tripsBody || t("tripsSettingsBody")}
          onPress={() => router.push("/settings/trips" as Href)}
          colors={colors}
        />
        {historyBody ? (
          <SettingsLinkCard
            icon="time-outline"
            title={t("historySettings")}
            body={historyBody}
            onPress={() => router.push("/settings/history" as Href)}
            colors={colors}
          />
        ) : null}
        <SettingsLinkCard
          icon="notifications-outline"
          title={t("homeAlertsTitle")}
          body={
            household.notificationsEnabled ? t("homeAlertsOnForAll") : t("homeAlertsOffForAll")
          }
          onPress={() => router.push("/settings/home-alerts" as Href)}
          colors={colors}
        />
      </SettingsSection>
    </Screen>
  );
}
