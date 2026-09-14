import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LOCALES } from "@/constants/i18n";
import { iconSize, type ThemeScheme } from "@/constants/theme";
import { supabase } from "@/lib/supabase";
import { isValidPassword } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

function SettingsCard({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="rounded-3xl bg-cove-paper px-4 py-4">
      <AppText className="text-sm font-medium text-cove-muted">{label}</AppText>
      <View className="mt-2">{children}</View>
    </View>
  );
}

export default function SettingsScreen() {
  const { user, signOut, changePassword } = useAuth();
  const { colors, scheme, setScheme } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [name, setName] = useState(
    typeof user?.user_metadata?.name === "string" ? user.user_metadata.name : t("member"),
  );
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    void supabase
      .from("profiles")
      .select("name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data && typeof data.name === "string" && data.name.trim()) {
          setName(data.name);
        }
      });
  }, [user]);

  const canUpdatePassword =
    currentPassword.length > 0 &&
    isValidPassword(newPassword) &&
    confirmPassword.length > 0;

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

    router.replace("/");
  }

  const email = user?.email ?? t("noEmail");
  const themes: { id: ThemeScheme; label: string }[] = [
    { id: "light", label: t("light") },
    { id: "dark", label: t("dark") },
  ];

  return (
    <Screen tabBarInset>
      <ScreenHeader title={t("settingsTitle")} subtitle={t("settingsSubtitle")} />

      <View className="gap-6">
        <View className="gap-3">
          <SectionHeader title={t("profile")} />
          <SettingsCard label={t("name")}>
            <AppText className="text-base font-semibold text-cove-ink">
              {name}
            </AppText>
          </SettingsCard>
          <SettingsCard label={t("email")}>
            <AppText className="text-base font-semibold text-cove-ink">
              {email}
            </AppText>
          </SettingsCard>

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
        </View>

        <View>
          <SectionHeader title={t("theme")} />
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
        </View>

        <View>
          <SectionHeader title={t("language")} />
          <View className="rounded-3xl bg-cove-paper px-4 py-4">
            <AppText className="text-sm font-medium text-cove-muted">
              {t("languageLabel")}
            </AppText>
            <View className="mt-3 flex-row gap-2">
              {LOCALES.map((option) => {
                const selected = locale === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => setLocale(option.id)}
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
        </View>

        <FormMessage message={signOutError} />
        <AppButton
          label={t("logOut")}
          variant="secondary"
          loading={isSigningOut}
          onPress={() => void onSignOut()}
        />
      </View>
    </Screen>
  );
}
