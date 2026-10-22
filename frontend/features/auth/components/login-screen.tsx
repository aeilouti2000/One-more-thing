import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import {
  AuthBrand,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthHeading,
  AuthLink,
} from "@/features/auth/components/auth-frame";
import { GuestOnly } from "@/features/auth/components/guest-only";
import { FormMessage } from "@/components/ui/FormMessage";
import { formatAppError } from "@/lib/errors";
import { isValidLoginName } from "@/lib/validation";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useI18n } from "@/providers/LanguageProvider";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFieldError(field: "username" | "password") {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  async function onSubmit() {
    const nextFieldErrors: { username?: string; password?: string } = {};
    if (!username.trim()) {
      nextFieldErrors.username = t("errorEnterUsername");
    } else if (!isValidLoginName(username)) {
      nextFieldErrors.username = t("errorInvalidEmail");
    }
    if (!password) {
      nextFieldErrors.password = t("errorEnterPassword");
    }
    if (nextFieldErrors.username || nextFieldErrors.password) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await signIn(username.trim(), password);
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
        <AuthHeading title={t("loginTitle")} subtitle={t("loginSubtitle")} />
        <View style={{ marginTop: 26, gap: 16 }}>
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
            placeholder={t("passwordPlaceholder")}
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              clearFieldError("password");
            }}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            error={fieldErrors.password}
          />
          <FormMessage message={error} />
          <AuthButton
            label={t("logIn")}
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />
          <AuthLink
            prompt={t("newHerePrompt")}
            action={t("newHereAction")}
            onPress={() => router.push("/signup")}
          />
        </View>
      </AuthFrame>
    </GuestOnly>
  );
}
