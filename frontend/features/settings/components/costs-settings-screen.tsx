import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { iconSize } from "@/constants/theme";
import { updateCostSettings } from "@/features/homes/api/homes";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { HOME_CURRENCIES, type CostSettings, type HomeCurrency } from "@/features/homes/types/household";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { CardBlock, CostAskToggle, SettingsSection } from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function CostsSettingsScreen() {
  const { user } = useAuth();
  const { household, adoptHome } = useHousehold();
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [costError, setCostError] = useState<string | null>(null);
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [isChoosingCurrency, setIsChoosingCurrency] = useState(false);
  const isHost =
    household?.members.some((member) => member.id === user?.id && member.role === "owner") ===
    true;

  useEffect(() => {
    if (!household) router.back();
  }, [household]);

  if (!household) return null;

  async function saveCostSettings(patch: Partial<CostSettings>) {
    if (!household || !isHost) return;
    const previous = household;
    // Apply immediately so Items / History / Trip pick up the change without a restart.
    adoptHome({ ...household, ...patch });
    setIsSavingCosts(true);
    setCostError(null);
    const result = await updateCostSettings(previous.id, patch);
    setIsSavingCosts(false);
    if (result.error || !result.home) {
      adoptHome(previous);
      setCostError(result.error ?? t("errorGeneric"));
      return;
    }
    adoptHome(result.home);
  }

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("costsSection")}
        subtitle={household.costsEnabled ? t("trackCosts") : t("costsSectionBody")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <CardBlock>
          <AppText className="mb-3 text-sm text-cove-muted">{t("costsSectionBody")}</AppText>
          <View className="flex-row items-center justify-between gap-3">
            <View className="min-w-0 flex-1">
              <AppText className="text-base font-semibold text-cove-ink">
                {t("trackCosts")}
              </AppText>
              <AppText className="mt-2 text-sm text-cove-muted">{t("trackCostsBody")}</AppText>
            </View>
            <Switch
              value={household.costsEnabled}
              disabled={!isHost || isSavingCosts}
              onValueChange={(enabled) => void saveCostSettings({ costsEnabled: enabled })}
              trackColor={{ false: colors.mist, true: colors.accent }}
              thumbColor={colors.white}
            />
          </View>
          {!isHost ? (
            <AppText className="mt-3 text-xs text-cove-muted">{t("costsHostOnly")}</AppText>
          ) : null}
          <FormMessage message={costError} />
        </CardBlock>

        {household.costsEnabled ? (
          <>
            <CardBlock>
              <AppText className="text-sm font-medium text-cove-muted">
                {t("currencyLabel")}
              </AppText>
              <Pressable
                disabled={!isHost || isSavingCosts}
                onPress={() => setIsChoosingCurrency((open) => !open)}
                className="mt-3 flex-row items-center justify-between gap-3 rounded-2xl bg-cove-mist px-4 py-3 active:opacity-80"
              >
                <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
                  {t(
                    (HOME_CURRENCIES.find((item) => item.code === household.currency)
                      ?.labelKey ?? "currencyJOD") as "currencyJOD",
                  )}
                </AppText>
                <Ionicons
                  name={isChoosingCurrency ? "chevron-up" : "chevron-down"}
                  size={iconSize.sm}
                  color={colors.ink}
                />
              </Pressable>
              {isChoosingCurrency ? (
                <View className="mt-3 gap-2">
                  {HOME_CURRENCIES.map((option) => {
                    const selected = household.currency === option.code;
                    return (
                      <Pressable
                        key={option.code}
                        disabled={!isHost || isSavingCosts}
                        onPress={() => {
                          setIsChoosingCurrency(false);
                          if (option.code !== household.currency) {
                            void saveCostSettings({ currency: option.code as HomeCurrency });
                          }
                        }}
                        className={`rounded-2xl px-4 py-3 ${
                          selected ? "bg-cove-accent" : "bg-cove-mist"
                        }`}
                      >
                        <AppText
                          className={`text-base font-semibold ${
                            selected ? "" : "text-cove-ink"
                          }`}
                          style={selected ? { color: colors.onAccent } : undefined}
                        >
                          {t(option.labelKey as "currencyJOD")}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </CardBlock>

            <CostAskToggle
              title={t("askCostSingle")}
              body={t("askCostSingleBody")}
              value={household.askCostOnSingleBuy}
              disabled={!isHost || isSavingCosts}
              onChange={(value) => void saveCostSettings({ askCostOnSingleBuy: value })}
              colors={colors}
            />
            <CostAskToggle
              title={t("askCostBulk")}
              body={t("askCostBulkBody")}
              value={household.askCostOnBulkBuy}
              disabled={!isHost || isSavingCosts}
              onChange={(value) => void saveCostSettings({ askCostOnBulkBuy: value })}
              colors={colors}
            />
            <CostAskToggle
              title={t("askCostTrip")}
              body={t("askCostTripBody")}
              value={household.askCostOnTripEnd}
              disabled={!isHost || isSavingCosts}
              onChange={(value) => void saveCostSettings({ askCostOnTripEnd: value })}
              colors={colors}
            />
          </>
        ) : null}
      </SettingsSection>
    </Screen>
  );
}
