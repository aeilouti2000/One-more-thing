import { useState } from "react";
import { router, type Href } from "expo-router";
import { View } from "react-native";
import {
  AuthBrand,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthHeading,
  AuthLegal,
  AuthLink,
} from "@/features/auth/components/auth-frame";
import { GuestOnly } from "@/features/auth/components/guest-only";
import { FormMessage } from "@/components/ui/FormMessage";
import { formatAppError } from "@/lib/errors";
import { isValidUsername } from "@/lib/validation";
import { useAuth } from "@/features/auth/providers/auth-provider";
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
    if (!username.trim()) {
      nextFieldErrors.username = t("errorEnterUsername");
    } else if (!isValidUsername(username)) {
      nextFieldErrors.username = t("errorInvalidEmail");
    }
    if (!password) {
      nextFieldErrors.password = t("errorEnterPassword");
    } else if (password.length < 6) {
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
      <AuthFrame>
        <AuthBrand />
        <AuthHeading title={t("signupTitle")} subtitle={t("signupSubtitle")} />
        <View style={{ marginTop: 26, gap: 14 }}>
          <AuthField
            label={t("yourName")}
            placeholder={t("namePlaceholder")}
            value={name}
            onChangeText={(value) => {
              setName(value);
              clearFieldError("name");
            }}
            autoComplete="name"
            error={fieldErrors.name}
          />
          <AuthField
            label={t("username")}
            placeholder={t("usernamePlaceholder")}
            value={username}
            onChangeText={(value) => {
              setUsername(value);
              clearFieldError("username");
            }}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            error={fieldErrors.username}
          />
          <AuthField
            label={t("password")}
            placeholder={t("passwordMinPlaceholder")}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              clearFieldError("password");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            error={fieldErrors.password}
          />
          <FormMessage message={error} />
          <AuthButton
            label={t("createAccount")}
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />
          <AuthLink label={t("alreadyHaveAccount")} onPress={() => router.push("/login")} />
          <AuthLegal
            onPrivacy={() => router.push("/legal/privacy" as Href)}
            onTerms={() => router.push("/legal/terms" as Href)}
          />
        </View>
      </AuthFrame>
    </GuestOnly>
  );
}
