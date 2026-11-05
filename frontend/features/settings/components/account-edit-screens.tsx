import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { CardBlock, SettingsSection } from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { isValidPassword, isValidUsername } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/settings/account");
}

/** Shared frame for the account sub-pages (back to Account). */
function AccountSubPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const showBack = useSettingsShowBack({ nested: true });
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  return (
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader title={title} subtitle={subtitle} showBack={showBack} splitJoin={splitJoin} />
      <SettingsSection>
        <CardBlock>
          <View className="gap-4">{children}</View>
        </CardBlock>
      </SettingsSection>
    </Screen>
  );
}

export function AccountNameScreen() {
  const { user, updateProfile } = useAuth();
  const { refresh: refreshHome } = useHousehold();
  const { t } = useI18n();
  const [name, setName] = useState(user?.name?.trim() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const unchanged = name.trim() === (user?.name?.trim() ?? "");

  async function save() {
    const next = name.trim();
    if (!next) {
      setError(t("errorEnterName"));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateProfile({ name: next });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    void refreshHome();
    goBack();
  }

  return (
    <AccountSubPage title={t("name")} subtitle={t("nameHint")}>
      <AppTextField
        label={t("name")}
        value={name}
        onChangeText={(value) => {
          setName(value);
          setError(null);
        }}
        placeholder={t("namePlaceholder")}
        autoComplete="name"
        autoFocus
        userText
      />
      <FormMessage message={error} />
      <AppButton
        label={t("saveName")}
        disabled={!name.trim() || unchanged}
        loading={saving}
        onPress={() => void save()}
      />
    </AccountSubPage>
  );
}

export function AccountUsernameScreen() {
  const { user, updateProfile } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState(user?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const unchanged = username.trim() === (user?.email ?? "");

  async function save() {
    const next = username.trim();
    if (!isValidUsername(next)) {
      setError(t("errorInvalidEmail"));
      return;
    }
    setSaving(true);
    setError(null);
    const result = await updateProfile({ email: next });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    goBack();
  }

  return (
    <AccountSubPage title={t("username")} subtitle={t("usernameHint")}>
      <AppTextField
        label={t("username")}
        value={username}
        onChangeText={(value) => {
          setUsername(value);
          setError(null);
        }}
        placeholder={t("usernamePlaceholder")}
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect={false}
        autoFocus
      />
      <FormMessage message={error} />
      <AppButton
        label={t("saveUsername")}
        disabled={!username.trim() || unchanged}
        loading={saving}
        onPress={() => void save()}
      />
    </AccountSubPage>
  );
}

export function AccountPasswordScreen() {
  const { changePassword } = useAuth();
  const { t } = useI18n();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canSave =
    currentPassword.length > 0 && isValidPassword(newPassword) && confirmPassword.length > 0;

  async function save() {
    if (!isValidPassword(newPassword)) {
      setError(t("errorPasswordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("errorPasswordsMismatch"));
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    const result = await changePassword(currentPassword, newPassword);
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSuccess(t("passwordUpdated"));
  }

  return (
    <AccountSubPage title={t("password")} subtitle={t("changePassword")}>
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
      <FormMessage message={error} />
      <FormMessage message={success} tone="success" onDismiss={() => setSuccess(null)} />
      <AppButton
        label={t("updatePassword")}
        disabled={!canSave}
        loading={saving}
        onPress={() => void save()}
      />
    </AccountSubPage>
  );
}
