import { formatAppError } from "@/lib/errors";
import { loadMonthPurchases, monthOnPhone } from "@/features/sync/month-purchases";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SheetField } from "@/components/ui/SheetField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { iconSize } from "@/constants/theme";
import { updateCostSettings } from "@/features/homes/api/homes";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { HOME_CURRENCIES, type CostSettings, type HomeCurrency } from "@/features/homes/types/household";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useExportPurchases } from "@/features/items/hooks/use-export";
import { usePurchases } from "@/features/items/hooks/use-purchases";
import {
  currencySymbol,
  formatCostInput,
  formatMoney,
  parseCostInput,
} from "@/features/items/utils/currency";
import { boughtInMonth, currentMonth, previousMonth } from "@/features/items/utils/insights";
import {
  CardBlock,
  CostAskToggle,
  HostLockField,
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

/** Largest monthly budget the server accepts. */
const MAX_BUDGET = 999_999_999;

export default function CostsSettingsScreen() {
  const { user } = useAuth();
  const { household, adoptHome } = useHousehold();
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [costError, setCostError] = useState<string | null>(null);
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [isChoosingCurrency, setIsChoosingCurrency] = useState(false);
  const { purchases } = usePurchases();
  const { exportItems, isExporting } = useExportPurchases();
  const [budgetText, setBudgetText] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const isHost =
    household?.members.some((member) => member.id === user?.id && member.role === "owner") ===
    true;

  useEffect(() => {
    if (!household) router.back();
  }, [household]);

  if (!household) return null;

  async function saveCostSettings(patch: Partial<CostSettings>) {
    if (!household || !isHost) return false;
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
      return false;
    }
    adoptHome(result.home);
    return true;
  }

  const savedBudget = household.monthlyBudget;
  const budgetLabel = savedBudget
    ? formatMoney(savedBudget, household.currency)
    : t("noBudgetSet");
  const currencyName = t(
    (HOME_CURRENCIES.find((item) => item.code === household.currency)?.labelKey ??
      "currencyJOD") as "currencyJOD",
  );
  const parsedBudget = parseCostInput(budgetText ?? "");
  const budgetInvalid =
    Number.isNaN(parsedBudget) || (parsedBudget !== null && parsedBudget > MAX_BUDGET);
  const nextBudget = parsedBudget && parsedBudget > 0 ? parsedBudget : null;

  function openBudget() {
    setCostError(null);
    setBudgetText(savedBudget ? formatCostInput(savedBudget, household?.currency) : "");
  }

  async function saveBudget(value: number | null) {
    if (isSavingCosts) return;
    if (value !== savedBudget) {
      const saved = await saveCostSettings({ monthlyBudget: value });
      // Not saved: the sheet stays open and shows why.
      if (!saved) return;
    }
    // Closing the sheet also puts the keyboard away.
    setBudgetText(null);
  }

  async function onExport(month: string) {
    setExportError(null);
    // A month older than the phone keeps is loaded from the server first.
    const homeId = household?.id;
    let source = purchases;
    if (homeId && !monthOnPhone(homeId, month)) {
      try {
        source = await loadMonthPurchases(homeId, month);
      } catch (error) {
        setExportError(formatAppError(error));
        return;
      }
    }
    const result = await exportItems(boughtInMonth(source, month), month);
    if (result.error) setExportError(result.error);
  }

  const thisMonth = currentMonth();

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("costsAndBudget")}
        subtitle={household.costsEnabled ? t("trackCosts") : t("costsSectionBody")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <HostOnly locked={!isHost}>
          <CardBlock>
            <AppText className="mb-3 text-sm text-cove-muted">{t("costsSectionBody")}</AppText>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <AppText className="text-base font-semibold text-cove-ink">
                  {t("trackCosts")}
                </AppText>
                <AppText className="mt-2 text-sm text-cove-muted">{t("trackCostsBody")}</AppText>
              </View>
              {isHost ? (
                <Switch
                  value={household.costsEnabled}
                  disabled={isSavingCosts}
                  onValueChange={(enabled) => void saveCostSettings({ costsEnabled: enabled })}
                  trackColor={{ false: colors.mist, true: colors.accent }}
                  thumbColor={colors.white}
                />
              ) : (
                <HostLockPill
                  label={household.costsEnabled ? t("settingOn") : t("settingOff")}
                  active={household.costsEnabled}
                />
              )}
            </View>
            <FormMessage message={costError} />
          </CardBlock>
        </HostOnly>

        {household.costsEnabled ? (
          <>
            <HostOnly locked={!isHost}>
              <CardBlock>
                <AppText className="text-sm font-medium text-cove-muted">
                  {t("currencyLabel")}
                </AppText>
                {isHost ? (
                  <Pressable
                    disabled={!isHost || isSavingCosts}
                    onPress={() => setIsChoosingCurrency((open) => !open)}
                    className="mt-3 flex-row items-center justify-between gap-3 rounded-2xl bg-cove-mist px-4 py-3 active:opacity-80"
                  >
                    <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
                      {currencyName}
                    </AppText>
                    <Ionicons
                      name={isChoosingCurrency ? "chevron-up" : "chevron-down"}
                      size={iconSize.sm}
                      color={colors.ink}
                    />
                  </Pressable>
                ) : (
                  <HostLockField label={currencyName} />
                )}
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
            </HostOnly>

            <HostOnly locked={!isHost}>
              <CardBlock>
                <AppText className="text-base font-semibold text-cove-ink">
                  {t("monthlyBudget")}
                </AppText>
                <AppText className="mt-1 text-sm text-cove-muted">{t("monthlyBudgetBody")}</AppText>
                {isHost ? (
                  <Pressable
                    disabled={isSavingCosts}
                    onPress={openBudget}
                    accessibilityRole="button"
                    accessibilityLabel={t("monthlyBudget")}
                    className="mt-3 flex-row items-center justify-between gap-3 rounded-2xl bg-cove-mist px-4 py-3 active:opacity-80"
                  >
                    <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
                      {budgetLabel}
                    </AppText>
                    <Ionicons name="pencil" size={iconSize.sm} color={colors.ink} />
                  </Pressable>
                ) : (
                  <HostLockField label={budgetLabel} />
                )}
              </CardBlock>
            </HostOnly>

            <HostOnly locked={!isHost}>
              <CostAskToggle
                title={t("askCostSingle")}
                body={t("askCostSingleBody")}
                value={household.askCostOnSingleBuy}
                disabled={!isHost || isSavingCosts}
                locked={!isHost}
                onChange={(value) => void saveCostSettings({ askCostOnSingleBuy: value })}
                colors={colors}
              />
            </HostOnly>
            <HostOnly locked={!isHost}>
              <CostAskToggle
                title={t("askCostBulk")}
                body={t("askCostBulkBody")}
                value={household.askCostOnBulkBuy}
                disabled={!isHost || isSavingCosts}
                locked={!isHost}
                onChange={(value) => void saveCostSettings({ askCostOnBulkBuy: value })}
                colors={colors}
              />
            </HostOnly>
            {/* Two independent end-of-trip prompts; only one can run, so turning
                one on turns the other off. */}
            <HostOnly locked={!isHost}>
              <CostAskToggle
                title={t("askCostTrip")}
                body={t("askCostTripBody")}
                value={household.askCostOnTripEnd && household.tripCostMode !== "total"}
                disabled={!isHost || isSavingCosts}
                locked={!isHost}
                onChange={(value) =>
                  void saveCostSettings(
                    value
                      ? { askCostOnTripEnd: true, tripCostMode: "items" }
                      : { askCostOnTripEnd: false },
                  )
                }
                colors={colors}
              />
            </HostOnly>
            <HostOnly locked={!isHost}>
              <CostAskToggle
                title={t("askCostTripTotal")}
                body={t("askCostTripTotalBody")}
                value={household.tripCostMode === "total"}
                disabled={!isHost || isSavingCosts}
                locked={!isHost}
                onChange={(value) =>
                  void saveCostSettings(
                    value
                      ? { tripCostMode: "total" }
                      : { tripCostMode: "items", askCostOnTripEnd: false },
                  )
                }
                colors={colors}
              />
            </HostOnly>

            <HostOnly locked={!isHost}>
              <CostAskToggle
                title={t("recapSetting")}
                body={t("recapSettingBody")}
                value={household.monthlyRecap !== false}
                disabled={!isHost || isSavingCosts}
                locked={!isHost}
                onChange={(value) => void saveCostSettings({ monthlyRecap: value })}
                colors={colors}
              />
            </HostOnly>

            <CardBlock>
              <AppText className="text-base font-semibold text-cove-ink">{t("exportTitle")}</AppText>
              <AppText className="mt-1 text-sm text-cove-muted">{t("exportBody")}</AppText>
              <View className="mt-3 flex-row gap-3">
                <View className="min-w-0 flex-1">
                  <AppButton
                    label={t("exportThisMonth")}
                    variant="secondary"
                    icon="share-outline"
                    disabled={isExporting}
                    onPress={() => void onExport(thisMonth)}
                    compact
                  />
                </View>
                <View className="min-w-0 flex-1">
                  <AppButton
                    label={t("exportLastMonth")}
                    variant="secondary"
                    disabled={isExporting}
                    onPress={() => void onExport(previousMonth(thisMonth))}
                    compact
                  />
                </View>
              </View>
              <FormMessage message={exportError} />
            </CardBlock>
          </>
        ) : null}
      </SettingsSection>

      <BottomSheet
        visible={budgetText !== null}
        locked={isSavingCosts}
        onClose={() => setBudgetText(null)}
      >
        <View className="gap-4">
          <AppText className="text-xl font-semibold text-cove-ink">{t("monthlyBudget")}</AppText>
          <AppText className="text-sm text-cove-muted">{t("monthlyBudgetBody")}</AppText>
          <SheetField
            value={budgetText ?? ""}
            onChangeText={setBudgetText}
            placeholder={formatCostInput(0, household.currency) || "0"}
            chip={currencySymbol(household.currency)}
            keyboardType="decimal-pad"
            autoCapitalize="none"
            maxLength={12}
            autoFocus
            onSubmitEditing={() => {
              // The keyboard's Done saves an amount; removing a budget is its own button.
              if (!budgetInvalid && nextBudget !== null) void saveBudget(nextBudget);
            }}
          />
          <FormMessage message={budgetInvalid ? t("errorInvalidCost") : costError} />
          <View className="flex-row gap-3">
            {savedBudget ? (
              <View className="min-w-0 flex-1">
                <AppButton
                  label={t("removeBudget")}
                  variant="secondary"
                  disabled={isSavingCosts}
                  onPress={() => void saveBudget(null)}
                />
              </View>
            ) : null}
            <View className="min-w-0 flex-1">
              <AppButton
                label={t("saveChanges")}
                loading={isSavingCosts}
                disabled={isSavingCosts || budgetInvalid || nextBudget === null}
                onPress={() => void saveBudget(nextBudget)}
              />
            </View>
          </View>
        </View>
      </BottomSheet>
    </Screen>
  );
}
