import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { withAlpha } from "@/constants/theme";
import { useAuth } from "@/features/auth/providers/auth-provider";
import {
  SettingsNavCard,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const DANGER = "#E5484D";

/** Account hub: each row opens its own page, like the other settings. */
export default function AccountSettingsScreen() {
  const { user, signOut, deleteAccount } = useAuth();
  const { colors } = useTheme();
  const { t } = useI18n();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isConfirmingSignOut, setIsConfirmingSignOut] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const displayName = user?.name?.trim() || t("member");
  const displayUsername = user?.email ?? t("noEmail");

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
    <Screen tabBarInset={tabBarInset}>
      <ScreenHeader
        title={t("account")}
        subtitle={displayName}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <SettingsNavCard
          icon="person-outline"
          title={t("name")}
          summary={displayName}
          onPress={() => router.push("/settings/account-name" as Href)}
          colors={colors}
        />
        <SettingsNavCard
          icon="at-outline"
          title={t("username")}
          summary={displayUsername}
          onPress={() => router.push("/settings/account-username" as Href)}
          colors={colors}
        />
        <SettingsNavCard
          icon="lock-closed-outline"
          title={t("password")}
          summary={t("changePassword")}
          onPress={() => router.push("/settings/account-password" as Href)}
          colors={colors}
        />
        <SettingsNavCard
          icon="log-out-outline"
          title={t("logOut")}
          summary={t("signedInAs", { name: user?.email ?? displayName })}
          onPress={() => {
            setSignOutError(null);
            setIsConfirmingSignOut(true);
          }}
          colors={colors}
        />
      </SettingsSection>

      {/* Destructive, so set apart and plain: red text, no red fill. */}
      <Pressable
        onPress={() => {
          setDeleteError(null);
          setDeletePassword("");
          setIsConfirmingDelete(true);
        }}
        disabled={isDeletingAccount}
        accessibilityRole="button"
        accessibilityLabel={t("deleteAccount")}
        className="mt-6 active:opacity-70"
      >
        <View className="flex-row items-center gap-3 overflow-hidden rounded-3xl bg-cove-paper px-4 py-4">
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: withAlpha(DANGER, 0.1) }}
          >
            <Ionicons name="trash-outline" size={20} color={DANGER} />
          </View>
          <AppText className="flex-1 text-base font-semibold" style={{ color: DANGER }}>
            {t("deleteAccount")}
          </AppText>
        </View>
      </Pressable>

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
