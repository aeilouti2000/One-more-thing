import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { withAlpha } from "@/constants/theme";
import { isGoogleSignInAvailable } from "@/features/auth/lib/google-sign-in";
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
const WARN = "#F08C2E";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GOOGLE_G = require("../../../assets/images/google-g.png");

/** Account hub: each row opens its own page, like the other settings. */
export default function AccountSettingsScreen() {
  const {
    user,
    signOut,
    deleteAccount,
    deleteAccountWithGoogle,
    linkGoogle,
    unlinkGoogle,
  } = useAuth();
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

  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [isConfirmingUnlink, setIsConfirmingUnlink] = useState(false);

  const displayName = user?.name?.trim() || t("member");
  const displayUsername = user?.email ?? t("noEmail");
  // Profiles cached by older versions lack these fields: assume a password.
  const hasPassword = user?.hasPassword !== false;
  const emailVerified = !!user?.emailVerified;
  const contactEmail = user?.contactEmail ?? null;
  const emailSummary = !contactEmail
    ? t("emailNotAdded")
    : emailVerified
      ? t("emailVerifiedSummary", { email: contactEmail })
      : t("emailNotVerified", { email: contactEmail });
  const googleLinked = !!user?.googleLinked;
  const googleAvailable = isGoogleSignInAvailable();

  async function onConnectGoogle() {
    setGoogleBusy(true);
    setGoogleError(null);
    const result = await linkGoogle();
    setGoogleBusy(false);
    if (result.error) setGoogleError(result.error);
  }

  async function onDisconnectGoogle() {
    setGoogleBusy(true);
    setGoogleError(null);
    const result = await unlinkGoogle();
    setGoogleBusy(false);
    if (result.error) {
      setGoogleError(result.error);
      return;
    }
    setIsConfirmingUnlink(false);
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
    if (hasPassword && !deletePassword) return;
    setIsDeletingAccount(true);
    setDeleteError(null);
    const result = hasPassword
      ? await deleteAccount(deletePassword)
      : await deleteAccountWithGoogle();
    setIsDeletingAccount(false);

    if ("cancelled" in result && result.cancelled) return;
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

      {!emailVerified ? (
        <Pressable
          onPress={() => router.push("/settings/account-email" as Href)}
          accessibilityRole="button"
          accessibilityLabel={
            contactEmail ? t("emailPendingBadge") : t("addEmailTitle")
          }
          className="mb-3 active:opacity-80"
        >
          <View
            className="flex-row items-center gap-3 overflow-hidden rounded-3xl px-4 py-4"
            style={{ backgroundColor: withAlpha(WARN, 0.12) }}
          >
            <View
              className="h-11 w-11 items-center justify-center rounded-2xl"
              style={{ backgroundColor: withAlpha(WARN, 0.18) }}
            >
              <Ionicons name="mail-unread-outline" size={21} color={WARN} />
            </View>
            <View className="min-w-0 flex-1">
              <AppText className="text-base font-semibold text-cove-ink">
                {contactEmail ? t("verifyEmailTitle") : t("addEmailTitle")}
              </AppText>
              <AppText className="mt-1 text-sm text-cove-muted">
                {contactEmail ? t("verifyEmailBody") : t("addEmailBody")}
              </AppText>
            </View>
          </View>
        </Pressable>
      ) : null}

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
          icon="mail-outline"
          title={t("email")}
          summary={emailSummary}
          onPress={() => router.push("/settings/account-email" as Href)}
          colors={colors}
        />
        <SettingsNavCard
          icon="lock-closed-outline"
          title={t("password")}
          summary={hasPassword ? t("changePassword") : t("setPassword")}
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

      <AppText className="mb-2.5 mt-6 px-1 text-xs font-bold uppercase tracking-widest text-cove-muted">
        {t("connectedAccounts")}
      </AppText>
      <View className="gap-3 overflow-hidden rounded-3xl bg-cove-paper px-4 py-4">
        <View className="flex-row items-center gap-3">
          <View
            className="h-11 w-11 items-center justify-center rounded-2xl"
            style={{ backgroundColor: colors.mist }}
          >
            <Image
              source={GOOGLE_G}
              style={{ width: 20, height: 20 }}
              contentFit="contain"
            />
          </View>
          <View className="min-w-0 flex-1">
            <AppText className="text-base font-semibold text-cove-ink">
              Google
            </AppText>
            <AppText className="mt-1 text-sm text-cove-muted" numberOfLines={2}>
              {googleLinked
                ? user?.googleEmail
                  ? t("googleConnected", { email: user.googleEmail })
                  : t("googleConnectedPlain")
                : googleAvailable
                  ? t("googleNotConnected")
                  : t("googleUnavailable")}
            </AppText>
          </View>
          {googleLinked || googleAvailable ? (
            <AppButton
              compact
              fit
              variant={googleLinked ? "ghost" : "secondary"}
              label={googleLinked ? t("disconnect") : t("connect")}
              loading={googleBusy && !isConfirmingUnlink}
              onPress={() => {
                setGoogleError(null);
                if (googleLinked) setIsConfirmingUnlink(true);
                else void onConnectGoogle();
              }}
            />
          ) : null}
        </View>
        {googleError && !isConfirmingUnlink ? (
          <FormMessage message={googleError} />
        ) : null}
      </View>

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
          <AppText
            className="flex-1 text-base font-semibold"
            style={{ color: DANGER }}
          >
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
        visible={isConfirmingUnlink}
        title={t("disconnectGoogleTitle")}
        message={
          hasPassword ? t("disconnectGoogleMessage") : t("googleNeedsPassword")
        }
        confirmLabel={hasPassword ? t("disconnect") : t("setPassword")}
        cancelLabel={t("cancel")}
        icon="unlink-outline"
        error={googleError}
        loading={googleBusy}
        onConfirm={() => {
          if (!hasPassword) {
            setIsConfirmingUnlink(false);
            router.push("/settings/account-password" as Href);
            return;
          }
          void onDisconnectGoogle();
        }}
        onCancel={() => {
          if (googleBusy) return;
          setIsConfirmingUnlink(false);
          setGoogleError(null);
        }}
      />
      <ConfirmModal
        visible={isConfirmingDelete}
        title={t("deleteAccountTitle")}
        message={
          hasPassword
            ? t("deleteAccountMessage")
            : `${t("deleteAccountMessage")}\n\n${t("deleteWithGoogleHint")}`
        }
        confirmLabel={hasPassword ? t("delete") : t("confirmWithGoogle")}
        cancelLabel={t("cancel")}
        icon="trash-outline"
        error={deleteError}
        loading={isDeletingAccount}
        onConfirm={() => {
          if (!hasPassword) {
            void onDeleteAccount();
            return;
          }
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
        {hasPassword ? (
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
        ) : null}
      </ConfirmModal>
    </Screen>
  );
}
