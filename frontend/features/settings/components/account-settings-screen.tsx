import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EditButton } from "@/components/ui/EditButton";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { iconSize } from "@/constants/theme";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import {
  CardBlock,
  SettingsCardIcon,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import { isValidPassword, isValidUsername } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function AccountSettingsScreen() {
  const { user, signOut, changePassword, updateProfile, deleteAccount } = useAuth();
  const { refresh: refreshHome } = useHousehold();
  const { colors, scheme } = useTheme();
  const { t, isRTL } = useI18n();
  const logOutBg = scheme === "dark" ? "#3F1D1D" : "#FEE2E2";
  const logOutFg = scheme === "dark" ? "#F07178" : "#C2414A";
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  if (user && !isEditingName) {
    const nextName = user.name?.trim() || t("member");
    if (name !== nextName) setName(nextName);
  }
  if (user && !isEditingUsername) {
    const nextUsername = user.email ?? "";
    if (username !== nextUsername) setUsername(nextUsername);
  }

  const canUpdatePassword =
    currentPassword.length > 0 &&
    isValidPassword(newPassword) &&
    confirmPassword.length > 0;

  const displayName = user?.name?.trim() || t("member");
  const displayUsername = user?.email ?? t("noEmail");

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

  async function onDeleteAccount() {
    if (!deletePassword) return;
    setIsDeletingAccount(true);
    setDeleteError(null);
    const result = await deleteAccount(deletePassword);
    setIsDeletingAccount(false);

    if (result.error) {
      setDeleteError(result.error);
      return;
    }

    setIsConfirmingDelete(false);
    setDeletePassword("");
    router.replace("/");
  }

  return (
    <Screen>
      <ScreenHeader
        title={t("account")}
        subtitle={displayName}
        showBack
        right={
          <Pressable
            onPress={() => {
              setSignOutError(null);
              setIsConfirmingSignOut(true);
            }}
            disabled={isSigningOut}
            accessibilityRole="button"
            accessibilityLabel={t("logOut")}
            className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
            style={{ backgroundColor: logOutBg, opacity: isSigningOut ? 0.5 : 1 }}
          >
            <Ionicons
              name="log-out-outline"
              size={iconSize.sm}
              color={logOutFg}
              style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
            />
          </Pressable>
        }
      />

      <SettingsSection>
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
              <View className="min-w-0 flex-1 flex-row items-start gap-3">
                <SettingsCardIcon icon="person-outline" colors={colors} />
                <View className="min-w-0 flex-1">
                  <AppText className="text-sm font-medium text-cove-muted">{t("name")}</AppText>
                  <AppText className="mt-2 text-base font-semibold text-cove-ink">
                    {displayName}
                  </AppText>
                  <FormMessage
                    message={nameSuccess}
                    tone="success"
                    onDismiss={() => setNameSuccess(null)}
                  />
                </View>
              </View>
              <EditButton
                compact
                variant="paper"
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
              <View className="min-w-0 flex-1 flex-row items-start gap-3">
                <SettingsCardIcon icon="at-outline" colors={colors} />
                <View className="min-w-0 flex-1">
                  <AppText className="text-sm font-medium text-cove-muted">{t("username")}</AppText>
                  <AppText className="mt-2 text-base font-semibold text-cove-ink">
                    {displayUsername}
                  </AppText>
                  <FormMessage
                    message={usernameSuccess}
                    tone="success"
                    onDismiss={() => setUsernameSuccess(null)}
                  />
                </View>
              </View>
              <EditButton
                compact
                variant="paper"
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
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <SettingsCardIcon icon="lock-closed-outline" colors={colors} />
              <View className="min-w-0 flex-1">
                <AppText className="text-sm font-medium text-cove-muted">{t("password")}</AppText>
                <AppText className="mt-2 text-base font-semibold text-cove-ink">
                  {t("changePassword")}
                </AppText>
              </View>
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
              <FormMessage
                message={passwordSuccess}
                tone="success"
                onDismiss={() => setPasswordSuccess(null)}
              />
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
          <AppButton
            label={t("deleteAccount")}
            variant="danger"
            disabled={isDeletingAccount}
            onPress={() => {
              setDeleteError(null);
              setDeletePassword("");
              setIsConfirmingDelete(true);
            }}
          />
        </CardBlock>
      </SettingsSection>

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
      <ConfirmModal
        visible={isConfirmingDelete}
        title={t("deleteAccountTitle")}
        message={t("deleteAccountMessage")}
        confirmLabel={t("delete")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
        error={deleteError}
        loading={isDeletingAccount}
        onConfirm={() => {
          if (deletePassword.length < 6) {
            setDeleteError(t("errorDeletePasswordWrong"));
            return;
          }
          void onDeleteAccount();
        }}
        onCancel={() => {
          if (isDeletingAccount) return;
          setIsConfirmingDelete(false);
          setDeletePassword("");
          setDeleteError(null);
        }}
      >
        <AppTextField
          compact
          glass
          label={t("password")}
          value={deletePassword}
          onChangeText={(value) => {
            setDeletePassword(value);
            setDeleteError(null);
          }}
          placeholder={t("password")}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="password"
        />
      </ConfirmModal>
    </Screen>
  );
}
