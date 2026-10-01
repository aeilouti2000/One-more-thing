import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
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
import { SectionHeader } from "@/components/ui/SectionHeader";
import { iconSize, type ThemeScheme } from "@/constants/theme";
import { useHousehold } from "@/hooks/useHousehold";
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

export default function SettingsScreen() {
  const { user, signOut, changePassword, updateProfile } = useAuth();
  const { refresh: refreshHome } = useHousehold();
  const { colors, scheme, setScheme } = useTheme();
  const { t, locale } = useI18n();
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
  const [pushStatus, setPushStatus] = useState<PushStatus>(
    canUsePush() ? (readPushEnabled() ? "on" : "off") : "unsupported",
  );
  const [isUpdatingPush, setIsUpdatingPush] = useState(false);

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

  const displayName = user?.name?.trim() || t("member");
  const displayUsername = user?.email ?? t("noEmail");
  const themes: { id: ThemeScheme; label: string }[] = [
    { id: "light", label: t("light") },
    { id: "dark", label: t("dark") },
  ];

  return (
    <Screen tabBarInset>
      <ScreenHeader
        title={t("settingsTitle")}
        subtitle={t("settingsSubtitle")}
        icon={
          <View
            className="items-center justify-center bg-white/20"
            style={{ width: 56, height: 56, borderRadius: 28 }}
          >
            <Ionicons name="settings-outline" size={34} color="#FFFFFF" />
          </View>
        }
      />

      <View className="gap-8">
        <View className="gap-3">
          <SectionHeader title={t("account")} />

          <View className="rounded-3xl bg-cove-paper px-4 py-4">
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
                  <AppText
                    className="mt-2 text-xs leading-4"
                    style={{ color: colors.muted, opacity: 0.62 }}
                  >
                    {t("nameHint")}
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
          </View>

          <View className="rounded-3xl bg-cove-paper px-4 py-4">
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
                  <AppText
                    className="mt-2 text-xs leading-4"
                    style={{ color: colors.muted, opacity: 0.62 }}
                  >
                    {t("usernameHint")}
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
          </View>

          <View className="rounded-3xl bg-cove-paper px-4 py-4">
            <Pressable
              onPress={() => setIsPasswordOpen((open) => !open)}
              className="flex-row items-center justify-between gap-3 active:opacity-80"
            >
              <View className="min-w-0 flex-1">
                <AppText className="text-sm font-medium text-cove-muted">
                  {t("password")}
                </AppText>
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
          </View>

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
        </View>

        <View className="gap-3">
          <SectionHeader title={t("appSettings")} />

          <View className="rounded-3xl bg-cove-paper px-4 py-4">
            <View className="flex-row items-center justify-between gap-3">
              <AppText className="min-w-0 flex-1 text-base font-semibold text-cove-ink">
                {t("listAlerts")}
              </AppText>
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
            <AppText className="mt-2 text-sm text-cove-muted">
              {pushStatus === "unsupported"
                ? t("notificationsPhoneOnly")
                : pushStatus === "denied"
                  ? t("notificationsDenied")
                  : t("listAlertsBody")}
            </AppText>
            {pushStatus === "denied" ? (
              <Pressable onPress={() => void Linking.openSettings()} className="mt-3 active:opacity-80">
                <AppText className="text-sm font-semibold text-cove-accent">
                  {t("openPhoneSettings")}
                </AppText>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            onPress={() => router.push("/staples")}
            className="rounded-3xl bg-cove-paper px-4 py-4 active:opacity-80"
          >
            <AppText className="text-base font-semibold text-cove-ink">{t("staplesTitle")}</AppText>
            <AppText className="mt-1 text-sm text-cove-muted">{t("staplesSubtitle")}</AppText>
          </Pressable>

          <View className="rounded-3xl bg-cove-paper px-4 py-4">
            <AppText className="text-sm font-medium text-cove-muted">
              {t("appearance")}
            </AppText>
            <View className="mt-3 flex-row gap-2">
              {themes.map((option) => {
                const selected = scheme === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setScheme(option.id)}
                    className={`flex-1 items-center rounded-2xl px-4 py-3 ${
                      selected ? "bg-cove-accent" : "bg-cove-mist"
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
          </View>

          <View className="rounded-3xl bg-cove-paper px-4 py-3">
            <AppText className="mb-2 text-sm font-medium text-cove-muted">
              {t("textSize")}
            </AppText>
            <FontSizeBar />
          </View>

          <View className="rounded-3xl bg-cove-paper px-4 py-4">
            <AppText className="text-sm font-medium text-cove-muted">
              {t("languageLabel")}
            </AppText>
            <View className="mt-3">
              <LanguagePicker />
            </View>
          </View>
        </View>
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
