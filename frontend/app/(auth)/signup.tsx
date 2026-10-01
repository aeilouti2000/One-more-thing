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
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    username?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    name.trim().length > 0 && username.trim().length > 0 && password.length >= 6;

  function clearFieldError(field: "name" | "username" | "password") {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  async function onSubmit() {
    const nextFieldErrors: { name?: string; username?: string; password?: string } = {};
    if (!name.trim()) {
      nextFieldErrors.name = t("errorEnterName");
    }
    if (!isValidUsername(username)) {
      nextFieldErrors.username = t("errorInvalidEmail");
    }
    if (password.length < 6) {
      nextFieldErrors.password = t("errorPasswordTooShort");
    }
    if (nextFieldErrors.name || nextFieldErrors.username || nextFieldErrors.password) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await signUp(name.trim(), username.trim(), password);
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

        <View className="mb-3 items-center">
          <AppLogo size={64} />
        </View>

        <View className="gap-3">
          <AppTextField
            label={t("yourName")}
            hint={t("nameHint")}
            value={name}
            onChangeText={(value) => {
              setName(value);
              clearFieldError("name");
            }}
            placeholder={t("namePlaceholder")}
            autoComplete="name"
            userText
            error={fieldErrors.name}
          />
          <AppTextField
            label={t("username")}
            hint={t("usernameHint")}
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
            hint={t("passwordHint")}
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
          <View className="mt-4">
            <AppButton
              label={t("createAccount")}
              disabled={!canSubmit}
              loading={isSubmitting}
              onPress={() => void onSubmit()}
            />
          </View>
          <Pressable onPress={() => router.push("/login")} className="items-center py-0.5">
            <AppText className="text-base text-cove-accent">
              {t("alreadyHaveAccount")}
            </AppText>
          </Pressable>
          <View className="flex-row flex-wrap justify-center gap-x-4 pt-0.5">
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
