import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Linking, Pressable, Switch, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EditButton } from "@/components/ui/EditButton";
import { FormMessage } from "@/components/ui/FormMessage";
import { FontSizeBar } from "@/components/ui/FontSizeBar";
import { LanguagePicker } from "@/components/ui/LanguagePicker";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ThemeColorPicker } from "@/components/ui/ThemeColorPicker";
import { LOCALES } from "@/constants/i18n";
import { headerIconFrameStyle, iconSize, type ThemeScheme } from "@/constants/theme";
import { useHousehold } from "@/hooks/useHousehold";
import { updateCostSettings } from "@/lib/homes";
import {
  canUsePush,
  readPushEnabled,
  syncPushRegistration,
  unregisterPushDevice,
  writePushEnabled,
  type PushStatus,
} from "@/lib/push";
import { isValidPassword, isValidUsername } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { HOME_CURRENCIES, type CostSettings, type HomeCurrency } from "@/types/household";

export default function SettingsScreen() {
  const { user, signOut, changePassword, updateProfile } = useAuth();
  const { household, refresh: refreshHome, adoptHome } = useHousehold();
  const { colors, scheme, setScheme } = useTheme();
  const { t, locale } = useI18n();
  const [openCard, setOpenCard] = useState<
    "account" | "app" | "costs" | "language" | "appearance" | null
  >(null);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [name, setName] = useState(user?.name?.trim() || t("member"));
  const [username, setUsername] = useState(user?.email ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSuccess, setUsernameSuccess] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [isSavingCosts, setIsSavingCosts] = useState(false);
  const [isChoosingCurrency, setIsChoosingCurrency] = useState(false);
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    canUsePush() ? (readPushEnabled() ? "on" : "off") : "unsupported",
  );
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);
  const isHost =
    household?.members.some((member) => member.id === user?.id && member.role === "owner") ===
    true;

  useEffect(() => {
    if (!user) return;
    if (!isEditingName) setName(user.name?.trim() || t("member"));
    if (!isEditingUsername) setUsername(user.email ?? "");
  }, [user, isEditingName, isEditingUsername, t]);

  useEffect(() => {
    if (!user || !canUsePush() || !readPushEnabled()) return;
    void syncPushRegistration(locale).then(setPushStatus);
  }, [locale, user]);

  async function onTogglePush(enabled: boolean) {
    setIsUpdatingPush(true);
    writePushEnabled(enabled);
    if (!enabled) {
      await unregisterPushDevice();
      setPushStatus("off");
      setIsUpdatingPush(false);
      return;
    }
    setPushStatus(await syncPushRegistration(locale));
    setIsUpdatingPush(false);
  }

  async function saveCostSettings(patch: Partial<CostSettings>) {
    if (!household || !isHost) return;
    setIsSavingCosts(true);
    setCostError(null);
    const result = await updateCostSettings(household.id, patch);
    setIsSavingCosts(false);
    if (result.error || !result.home) {
      setCostError(result.error ?? t("errorGeneric"));
      return;
    }
    adoptHome(result.home);
  }

  const canUpdatePassword =
    currentPassword.length > 0 &&
    isValidPassword(newPassword) &&
    confirmPassword.length > 0;

  async function onSaveName() {
    const next = name.trim();
    if (!next) {
      setNameSuccess(null);
      setNameError(t("errorEnterName"));
      return;
    }
    setIsSavingName(true);
    setNameError(null);
    setNameSuccess(null);
    const result = await updateProfile({ name: next });
    setIsSavingName(false);
    if (result.error) {
      setNameError(result.error);
      return;
    }
    setIsEditingName(false);
    setNameSuccess(t("nameUpdated"));
    void refreshHome();
  }

  async function onSaveUsername() {
    const next = username.trim();
    if (!isValidUsername(next)) {
      setUsernameSuccess(null);
      setUsernameError(t("errorInvalidEmail"));
      return;
    }
    setIsSavingUsername(true);
    setUsernameError(null);
    setUsernameSuccess(null);
    const result = await updateProfile({ email: next });
    setIsSavingUsername(false);
    if (result.error) {
      setUsernameError(result.error);
      return;
    }
    setIsEditingUsername(false);
    setUsernameSuccess(t("usernameUpdated"));
  }

  async function onChangePassword() {
    if (!isValidPassword(newPassword)) {
      setPasswordSuccess(null);
      setPasswordError(t("errorPasswordTooShort"));
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordSuccess(null);
      setPasswordError(t("errorPasswordsMismatch"));
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);
    const result = await changePassword(currentPassword, newPassword);
    setIsUpdatingPassword(false);

    if (result.error) {
      setPasswordError(result.error);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSuccess(t("passwordUpdated"));
  }

  async function onSignOut() {
    setIsSigningOut(true);
    setSignOutError(null);
    const result = await signOut();
    setIsSigningOut(false);

    if (result.error) {
      setSignOutError(result.error);
      return;
    }

    setIsConfirmingSignOut(false);
    router.replace("/");
  }

  function toggleCard(card: typeof openCard) {
    setOpenCard((current) => (current === card ? null : card));
  }

  const displayName = user?.name?.trim() || t("member");
  const displayUsername = user?.email ?? t("noEmail");
  const languageLabel = LOCALES.find((item) => item.id === locale)?.label ?? t("language");
  const themes: { id: ThemeScheme; label: string }[] = [
    { id: "light", label: t("light") },
    { id: "dark", label: t("dark") },
  ];
  const costsSummary = !household
    ? t("costsSectionBody")
    : household.costsEnabled
      ? t("trackCosts")
      : t("costsSection");

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
            <Ionicons name="settings-outline" size={34} color="#FFFFFF" />
          </View>
        }
      />

      <View className="gap-3">
        <SettingsCard
          icon="person-outline"
          title={t("account")}
          summary={displayName}
          open={openCard === "account"}
          onToggle={() => toggleCard("account")}
          colors={colors}
        >
          <CardBlock>
            {isEditingName ? (
              <View className="gap-4">
                <AppTextField
                  label={t("name")}
                  hint={t("nameHint")}
                  value={name}
                  onChangeText={setName}
                  placeholder={t("namePlaceholder")}
                  autoComplete="name"
                  userText
                />
                <FormMessage message={nameError} />
                <View className="gap-2">
                  <AppButton
                    label={t("saveName")}
                    disabled={!name.trim()}
                    loading={isSavingName}
                    onPress={() => void onSaveName()}
                  />
                  <AppButton
                    label={t("cancel")}
                    variant="ghost"
                    disabled={isSavingName}
                    onPress={() => {
                      setIsEditingName(false);
                      setName(displayName);
                      setNameError(null);
                    }}
                  />
                </View>
              </View>
            ) : (
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <AppText className="text-sm font-medium text-cove-muted">{t("name")}</AppText>
                  <AppText className="mt-2 text-base font-semibold text-cove-ink">
                    {displayName}
                  </AppText>
                  <FormMessage message={nameSuccess} tone="success" />
                </View>
                <EditButton
                  variant="mist"
                  accessibilityLabel={t("editName")}
                  onPress={() => {
                    setName(displayName);
                    setIsEditingName(true);
                    setNameSuccess(null);
                    setNameError(null);
                  }}
                />
              </View>
            )}
          </CardBlock>

          <CardBlock>
            {isEditingUsername ? (
              <View className="gap-4">
                <AppTextField
                  label={t("username")}
                  hint={t("usernameHint")}
                  value={username}
                  onChangeText={setUsername}
                  placeholder={t("usernamePlaceholder")}
                  autoCapitalize="none"
                  autoComplete="username"
                  autoCorrect={false}
                />
                <FormMessage message={usernameError} />
                <View className="gap-2">
                  <AppButton
                    label={t("saveUsername")}
                    disabled={!username.trim()}
                    loading={isSavingUsername}
                    onPress={() => void onSaveUsername()}
                  />
                  <AppButton
                    label={t("cancel")}
                    variant="ghost"
                    disabled={isSavingUsername}
                    onPress={() => {
                      setIsEditingUsername(false);
                      setUsername(user?.email ?? "");
                      setUsernameError(null);
                    }}
                  />
                </View>
              </View>
            ) : (
              <View className="flex-row items-start justify-between gap-3">
                <View className="min-w-0 flex-1">
                  <AppText className="text-sm font-medium text-cove-muted">{t("username")}</AppText>
                  <AppText className="mt-2 text-base font-semibold text-cove-ink">
                    {displayUsername}
                  </AppText>
                  <FormMessage message={usernameSuccess} tone="success" />
                </View>
                <EditButton
                  variant="mist"
                  accessibilityLabel={t("editUsername")}
                  onPress={() => {
                    setUsername(user?.email ?? "");
                    setIsEditingUsername(true);
                    setUsernameSuccess(null);
                    setUsernameError(null);
                  }}
                />
              </View>
            )}
          </CardBlock>

          <CardBlock>
            <Pressable
              onPress={() => setIsPasswordOpen((open) => !open)}
              className="flex-row items-center justify-between gap-3 active:opacity-80"
            >
              <View className="min-w-0 flex-1">
                <AppText className="text-sm font-medium text-cove-muted">{t("password")}</AppText>
                <AppText className="mt-2 text-base font-semibold text-cove-ink">
                  {t("changePassword")}
                </AppText>
              </View>
              <Ionicons
                name={isPasswordOpen ? "chevron-up" : "chevron-down"}
                size={iconSize.sm}
                color={colors.ink}
              />
            </Pressable>

            {isPasswordOpen ? (
              <View className="mt-4 gap-4">
                <AppTextField
                  label={t("currentPassword")}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder={t("currentPasswordPlaceholder")}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="password"
                />
                <AppTextField
                  label={t("newPassword")}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder={t("passwordMinPlaceholder")}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <AppTextField
                  label={t("confirmNewPassword")}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder={t("confirmPasswordPlaceholder")}
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="new-password"
                />
                <FormMessage message={passwordError} />
                <FormMessage message={passwordSuccess} tone="success" />
                <AppButton
                  label={t("updatePassword")}
                  disabled={!canUpdatePassword}
                  loading={isUpdatingPassword}
                  onPress={() => void onChangePassword()}
                />
              </View>
            ) : null}
          </CardBlock>

          <CardBlock>
            <FormMessage message={signOutError} />
            <AppButton
              label={t("logOut")}
              variant="danger"
              disabled={isSigningOut}
              onPress={() => {
                setSignOutError(null);
                setIsConfirmingSignOut(true);
              }}
            />
          </CardBlock>
        </SettingsCard>

        <SettingsCard
          icon="options-outline"
          title={t("appSettings")}
          summary={`${t("staplesTitle")} · ${t("listAlerts")}`}
          open={openCard === "app"}
          onToggle={() => toggleCard("app")}
          colors={colors}
        >
          <CardBlock>
            <Pressable
              onPress={() => router.push("/staples")}
              className="flex-row items-center justify-between gap-3 active:opacity-80"
            >
              <View className="min-w-0 flex-1">
                <AppText className="text-base font-semibold text-cove-ink">
                  {t("staplesTitle")}
                </AppText>
                <AppText className="mt-1 text-sm text-cove-muted">{t("staplesSubtitle")}</AppText>
              </View>
              <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.muted} />
            </Pressable>
          </CardBlock>

          <CardBlock>
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                <AppText className="text-base font-semibold text-cove-ink">
                  {t("listAlerts")}
                </AppText>
                <AppText className="mt-2 text-sm text-cove-muted">
                  {pushStatus === "unsupported"
                    ? t("notificationsPhoneOnly")
                    : pushStatus === "denied"
                      ? t("notificationsDenied")
                      : t("listAlertsBody")}
                </AppText>
                {pushStatus === "denied" ? (
                  <Pressable
                    onPress={() => void Linking.openSettings()}
                    className="mt-3 self-start active:opacity-80"
                  >
                    <AppText className="text-sm font-semibold text-cove-accent">
                      {t("openPhoneSettings")}
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
              {pushStatus === "unsupported" ? null : (
                <Switch
                  value={pushStatus !== "off"}
                  disabled={isUpdatingPush}
                  onValueChange={(enabled) => void onTogglePush(enabled)}
                  trackColor={{ false: colors.mist, true: colors.accent }}
                  thumbColor={colors.white}
                />
              )}
            </View>
          </CardBlock>
        </SettingsCard>

        {household ? (
          <SettingsCard
            icon="cash-outline"
            title={t("costsSection")}
            summary={costsSummary}
            open={openCard === "costs"}
            onToggle={() => toggleCard("costs")}
            colors={colors}
          >
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
                    className="mt-3 flex-row items-center justify-between gap-3 rounded-2xl bg-cove-paper px-4 py-3 active:opacity-80"
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
                              selected ? "bg-cove-accent" : "bg-cove-paper"
                            }`}
                          >
                            <AppText
                              className={`text-base font-semibold ${
                                selected ? "text-white" : "text-cove-ink"
                              }`}
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
          </SettingsCard>
        ) : null}

        <SettingsCard
          icon="language-outline"
          title={t("languageLabel")}
          summary={languageLabel}
          open={openCard === "language"}
          onToggle={() => toggleCard("language")}
          colors={colors}
        >
          <CardBlock>
            <LanguagePicker />
          </CardBlock>
        </SettingsCard>

        <SettingsCard
          icon="color-palette-outline"
          title={t("appearance")}
          summary={`${scheme === "dark" ? t("dark") : t("light")} · ${t("textSize")}`}
          open={openCard === "appearance"}
          onToggle={() => toggleCard("appearance")}
          colors={colors}
        >
          <CardBlock>
            <AppText className="mb-3 text-sm font-medium text-cove-muted">{t("theme")}</AppText>
            <View className="flex-row gap-2">
              {themes.map((option) => {
                const selected = scheme === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setScheme(option.id)}
                    className={`flex-1 items-center rounded-2xl px-4 py-3 ${
                      selected ? "bg-cove-accent" : "bg-cove-paper"
                    }`}
                  >
                    <AppText
                      className={`text-base font-semibold ${
                        selected ? "text-white" : "text-cove-ink"
                      }`}
                    >
                      {option.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View className="mt-5">
              <ThemeColorPicker />
            </View>
          </CardBlock>

          <CardBlock>
            <AppText className="mb-2 text-sm font-medium text-cove-muted">
              {t("textSize")}
            </AppText>
            <FontSizeBar />
          </CardBlock>
        </SettingsCard>
      </View>

      <ConfirmModal
        visible={isConfirmingSignOut}
        title={t("logOutTitle")}
        message={t("logOutMessage")}
        confirmLabel={t("logOut")}
        cancelLabel={t("cancel")}
        icon="log-out-outline"
        error={signOutError}
        loading={isSigningOut}
        onConfirm={() => void onSignOut()}
        onCancel={() => {
          if (isSigningOut) return;
          setIsConfirmingSignOut(false);
          setSignOutError(null);
        }}
      />
    </Screen>
  );
}

function SettingsCard({
  icon,
  title,
  summary,
  open,
  onToggle,
  colors,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  colors: { mist: string; accent: string; ink: string; muted: string };
  children: ReactNode;
}) {
  return (
    <View className="overflow-hidden rounded-3xl bg-cove-paper">
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="flex-row items-center gap-3 px-4 py-4 active:opacity-80"
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: colors.mist }}
        >
          <Ionicons name={icon} size={22} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <AppText className="text-base font-semibold text-cove-ink">{title}</AppText>
          <AppText className="mt-1 text-sm text-cove-muted" numberOfLines={1}>
            {summary}
          </AppText>
        </View>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={iconSize.sm}
          color={colors.ink}
        />
      </Pressable>
      {open ? <View className="gap-2.5 px-3 pb-3">{children}</View> : null}
    </View>
  );
}

function CardBlock({ children }: { children: ReactNode }) {
  return <View className="rounded-2xl bg-cove-soft px-3.5 py-3.5">{children}</View>;
}

function CostAskToggle({
  title,
  body,
  value,
  disabled,
  onChange,
  colors,
}: {
  title: string;
  body: string;
  value: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  colors: { mist: string; accent: string; white: string };
}) {
  return (
    <CardBlock>
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <AppText className="text-base font-semibold text-cove-ink">{title}</AppText>
          <AppText className="mt-2 text-sm text-cove-muted">{body}</AppText>
        </View>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ false: colors.mist, true: colors.accent }}
          thumbColor={colors.white}
        />
      </View>
    </CardBlock>
  );
}
