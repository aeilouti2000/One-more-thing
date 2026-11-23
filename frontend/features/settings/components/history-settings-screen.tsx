import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { ToastMessage } from "@/components/ui/ToastMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { updateHistorySettings } from "@/features/homes/api/homes";
import { HistoryPeriodNotice, useHistoryPeriodLabel } from "@/features/homes/components/history-period-notice";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { chooseHistory, historyNow, keptFrom, longDate, noticeEnd, shortens } from "@/features/homes/utils/history-period";
import {
  CardBlock,
  HostLockPill,
  HostOnly,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const NEVER_REMOVED = [
  { icon: "create-outline", text: "historyKeptItems" },
  { icon: "pin-outline", text: "historyKeptPins" },
  { icon: "bulb-outline", text: "historyKeptSuggestions" },
  { icon: "stats-chart-outline", text: "historyKeptTotals" },
] as const;

/**
 * How long History is kept, for everyone in the home (docs/history-period-spec.md 5.2).
 * Host only. A shorter period asks first and waits 30 days; a longer one saves at once.
 */
export default function HistorySettingsScreen() {
  const { user } = useAuth();
  const { household, adoptHome } = useHousehold();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const periodLabel = useHistoryPeriodLabel();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The shorter period waiting for "Keep N months?" in the sheet. */
  const [asking, setAsking] = useState<number | null>(null);

  const isHost =
    household?.members.some((member) => member.id === user?.id && member.role === "owner") === true;
  const history = household?.history ? historyNow(household.history) : null;

  useEffect(() => {
    // No home, or an older server that doesn't know the setting.
    if (!household?.history) router.back();
  }, [household]);

  if (!household || !history) return null;

  async function save(months: number) {
    if (!household || !isHost) return;
    setAsking(null);
    const previous = household;
    if (previous.history) adoptHome({ ...previous, history: chooseHistory(previous.history, months) });
    setIsSaving(true);
    setError(null);
    const result = await updateHistorySettings(previous.id, months);
    setIsSaving(false);
    if (result.error || !result.home) {
      adoptHome(previous);
      setError(result.error ?? t("errorGeneric"));
      return;
    }
    adoptHome(result.home);
  }

  function choose(months: number) {
    if (!history || months === history.chosen) return;
    if (shortens(history, months)) setAsking(months);
    else void save(months);
  }

  const askingFrom = noticeEnd();

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("historySettings")}
        subtitle={`${household.name} · ${t("sharedByEveryone")}`}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        {history.pending ? (
          <HistoryPeriodNotice
            history={history}
            action={
              isHost
                ? {
                    label: t("historyKeepPeriod", { period: periodLabel(history.months) }),
                    onPress: () => void save(history.months),
                    disabled: isSaving,
                  }
                : undefined
            }
          />
        ) : null}

        <HostOnly locked={!isHost}>
          <CardBlock>
            {isHost ? (
              <>
                <AppText className="text-base font-semibold text-cove-ink">{t("historyKeepFor")}</AppText>
                <View className="mt-3 flex-row gap-2">
                  {history.options.map((months) => {
                    const selected = history.chosen === months;
                    const label = periodLabel(months);
                    return (
                      <Pressable
                        key={months}
                        disabled={isSaving}
                        onPress={() => choose(months)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected, disabled: isSaving }}
                        accessibilityLabel={label}
                        className={`min-w-0 flex-1 items-center rounded-2xl px-2 py-3 active:opacity-80 ${
                          selected ? "bg-cove-accent" : "bg-cove-mist"
                        }`}
                      >
                        <AppText
                          className={`text-base font-semibold ${selected ? "" : "text-cove-ink"}`}
                          style={selected ? { color: colors.onAccent } : undefined}
                          numberOfLines={1}
                        >
                          {label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
                <AppText className="mt-2.5 text-sm text-cove-muted">
                  {t("historyPeriodBody", { period: periodLabel(history.chosen) })}
                </AppText>
              </>
            ) : (
              <>
                <View className="flex-row items-center gap-3">
                  <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
                    {t("historyKeepFor")}
                  </AppText>
                  <HostLockPill label={periodLabel(history.chosen)} active />
                </View>
                <AppText className="mt-2 text-sm text-cove-muted">{t("hostOnlyToast")}</AppText>
              </>
            )}
          </CardBlock>
        </HostOnly>

        <CardBlock>
          <AppText className="text-base font-semibold text-cove-ink">{t("historyNeverRemoved")}</AppText>
          <View className="mt-2 gap-1">
            {NEVER_REMOVED.map((row) => (
              <View key={row.text} className="flex-row items-center gap-2.5 py-1">
                <Ionicons name={row.icon} size={16} color={colors.accentText} />
                <AppText className="min-w-0 flex-1 text-sm text-cove-ink">{t(row.text)}</AppText>
              </View>
            ))}
          </View>
        </CardBlock>

        <ToastMessage message={error} onDismiss={() => setError(null)} />
      </SettingsSection>

      <BottomSheet visible={asking !== null} locked={isSaving} onClose={() => setAsking(null)}>
        {asking !== null ? (
          <View className="gap-3">
            <AppText className="text-xl font-semibold text-cove-ink">
              {t("historyConfirmTitle", { period: periodLabel(asking) })}
            </AppText>
            <AppText className="text-sm text-cove-muted">
              {t("historyConfirmBody", {
                day: longDate(keptFrom(askingFrom, asking), locale),
                date: longDate(askingFrom, locale),
              })}
            </AppText>
            <AppText className="text-sm text-cove-muted">{t("historyConfirmUndo")}</AppText>
            <View className="mt-2 gap-3">
              <AppButton
                label={t("historyKeepPeriod", { period: periodLabel(asking) })}
                loading={isSaving}
                disabled={isSaving}
                onPress={() => void save(asking)}
              />
              <AppButton
                label={t("cancel")}
                variant="secondary"
                disabled={isSaving}
                onPress={() => setAsking(null)}
              />
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
