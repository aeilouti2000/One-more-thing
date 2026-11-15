import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { updateTripSettings } from "@/features/homes/api/homes";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { TRIP_AUTO_END_HOURS, type TripSettings } from "@/features/homes/types/household";
import {
  CardBlock,
  CostAskToggle,
  HostLockPill,
  HostOnly,
  SettingsCardCopy,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** How shopping trips behave for everyone in the home. Host only. */
export default function TripsSettingsScreen() {
  const { user } = useAuth();
  const { household, adoptHome } = useHousehold();
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost =
    household?.members.some((member) => member.id === user?.id && member.role === "owner") === true;

  useEffect(() => {
    if (!household) router.back();
  }, [household]);

  if (!household) return null;

  async function save(patch: Partial<TripSettings>) {
    if (!household || !isHost) return;
    const previous = household;
    adoptHome({ ...household, ...patch });
    setIsSaving(true);
    setError(null);
    const result = await updateTripSettings(previous.id, patch);
    setIsSaving(false);
    if (result.error || !result.home) {
      adoptHome(previous);
      setError(result.error ?? t("errorGeneric"));
      return;
    }
    adoptHome(result.home);
  }

  const choices: (number | null)[] = [null, ...TRIP_AUTO_END_HOURS];
  const autoEndLabel = (hours: number | null) =>
    hours === null ? t("settingOff") : t("hoursShort", { hours });

  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("tripsSettings")}
        subtitle={`${household.name} · ${t("sharedByEveryone")}`}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <HostOnly locked={!isHost}>
          <CostAskToggle
            title={t("tripAskName")}
            body={t("tripAskNameBody")}
            value={household.tripAskName}
            disabled={!isHost || isSaving}
            locked={!isHost}
            onChange={(value) => void save({ tripAskName: value })}
            colors={colors}
          />
        </HostOnly>

        <HostOnly locked={!isHost}>
          <CostAskToggle
            title={t("tripSummarySetting")}
            body={t("tripSummarySettingBody")}
            value={household.tripSummary}
            disabled={!isHost || isSaving}
            locked={!isHost}
            onChange={(value) => void save({ tripSummary: value })}
            colors={colors}
          />
        </HostOnly>

        <HostOnly locked={!isHost}>
          <CostAskToggle
            title={t("tripShopTogether")}
            body={t("tripShopTogetherBody")}
            value={household.tripShopTogether}
            disabled={!isHost || isSaving}
            locked={!isHost}
            onChange={(value) => void save({ tripShopTogether: value })}
            colors={colors}
          />
        </HostOnly>

        <HostOnly locked={!isHost}>
          <CardBlock>
            <SettingsCardCopy title={t("tripAutoEnd")} body={t("tripAutoEndBody")} />
            {isHost ? (
              <View className="mt-3 flex-row flex-wrap gap-2">
                {choices.map((hours) => {
                  const selected = (household.tripAutoEndHours ?? null) === hours;
                  const label = autoEndLabel(hours);
                  return (
                    <Pressable
                      key={String(hours)}
                      disabled={!isHost || isSaving}
                      onPress={() => {
                        if (!selected) void save({ tripAutoEndHours: hours });
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected, disabled: !isHost }}
                      accessibilityLabel={label}
                      className={`rounded-2xl px-4 py-3 active:opacity-80 ${
                        selected ? "bg-cove-accent" : "bg-cove-mist"
                      }`}
                    >
                      <AppText
                        className={`text-base font-semibold ${selected ? "" : "text-cove-ink"}`}
                        style={selected ? { color: colors.onAccent } : undefined}
                      >
                        {label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View className="mt-3">
                <HostLockPill
                  label={autoEndLabel(household.tripAutoEndHours ?? null)}
                  active={household.tripAutoEndHours != null}
                />
              </View>
            )}
          </CardBlock>
        </HostOnly>

        <FormMessage message={error} />
      </SettingsSection>
    </Screen>
  );
}
