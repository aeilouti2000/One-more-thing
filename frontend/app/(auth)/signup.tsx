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
import { isValidEmail } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length >= 6;

  function clearFieldError(field: "email" | "password") {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  async function onSubmit() {
    const nextFieldErrors: { email?: string; password?: string } = {};
    if (!isValidEmail(email)) {
      nextFieldErrors.email = t("errorInvalidEmail");
    }
    if (password.length < 6) {
      nextFieldErrors.password = t("errorPasswordTooShort");
    }
    if (nextFieldErrors.email || nextFieldErrors.password) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await signUp(name, email, password);
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
                label={t("yourName")}
                value={name}
                onChangeText={setName}
                placeholder={t("namePlaceholder")}
                autoComplete="name"
              />
              <AppTextField
                label={t("email")}
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  clearFieldError("email");
                }}
                placeholder={t("emailPlaceholder")}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                error={fieldErrors.email}
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
