import { useState } from "react";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { GuestOnly } from "@/components/auth/GuestOnly";
import { AppButton } from "@/components/ui/AppButton";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { formatAppError } from "@/lib/errors";
import { isValidUsername } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    username?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    username.trim().length > 0 && password.length >= 6 && confirmPassword.length > 0;

  function clearFieldError(field: "username" | "password" | "confirmPassword") {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  async function onSubmit() {
    const nextFieldErrors: { username?: string; password?: string; confirmPassword?: string } = {};
    if (!isValidUsername(username)) {
      nextFieldErrors.username = t("errorInvalidEmail");
    }
    if (password.length < 6) {
      nextFieldErrors.password = t("errorPasswordTooShort");
    }
    if (password !== confirmPassword) {
      nextFieldErrors.confirmPassword = t("errorConfirmPassword");
    }
    if (nextFieldErrors.username || nextFieldErrors.password || nextFieldErrors.confirmPassword) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await signUp(username.trim(), username, password);
      if (result.error) {
        setError(result.error);
        return;
      }

      router.replace("/");
    } catch (submitError) {
      setError(formatAppError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <GuestOnly>
      <Screen>
        <ScreenHeader title={t("signupTitle")} subtitle={t("signupSubtitle")} showBack />

        <View className="mb-6 items-center">
              <AppLogo size={88} />
            </View>

            <View className="gap-6">
              <AppTextField
                label={t("username")}
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  clearFieldError("username");
                }}
                placeholder={t("usernamePlaceholder")}
                autoCapitalize="none"
                autoComplete="username"
                autoCorrect={false}
                error={fieldErrors.username}
              />
              <AppTextField
                label={t("password")}
                value={password}
                onChangeText={(value) => {
                  setPassword(value);
                  clearFieldError("password");
                }}
                placeholder={t("passwordMinPlaceholder")}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                error={fieldErrors.password}
              />
              <AppTextField
                label={t("confirmPassword")}
                value={confirmPassword}
                onChangeText={(value) => {
                  setConfirmPassword(value);
                  clearFieldError("confirmPassword");
                }}
                placeholder={t("confirmPasswordHint")}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                error={fieldErrors.confirmPassword}
              />
              <FormMessage message={error} />
              <AppButton
                label={t("createAccount")}
                disabled={!canSubmit}
                loading={isSubmitting}
                onPress={() => void onSubmit()}
              />
              <Pressable onPress={() => router.push("/login")} className="items-center py-1">
                <AppText className="text-base text-cove-accent">
                  {t("alreadyHaveAccount")}
                </AppText>
              </Pressable>
              <View className="flex-row flex-wrap justify-center gap-x-4">
                <Pressable onPress={() => router.push("/legal/privacy" as Href)}>
                  <AppText className="text-sm text-cove-muted">{t("privacyPolicy")}</AppText>
                </Pressable>
                <Pressable onPress={() => router.push("/legal/terms" as Href)}>
                  <AppText className="text-sm text-cove-muted">{t("terms")}</AppText>
                </Pressable>
              </View>
            </View>
      </Screen>
    </GuestOnly>
  );
}
