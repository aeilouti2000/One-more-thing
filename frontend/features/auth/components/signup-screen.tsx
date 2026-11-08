import { useState } from "react";
import { router, type Href } from "expo-router";
import { View } from "react-native";
import {
  AuthButton,
  AuthField,
  AuthLegal,
  AuthLink,
} from "@/features/auth/components/auth-frame";
import {
  AuthSheetHeading,
  AuthSheetPage,
} from "@/features/auth/components/auth-shell";
import { GoogleAuthSection } from "@/features/auth/components/google-auth-section";
import { setPostAuthRoute } from "@/features/auth/lib/post-auth-route";
import { FormMessage } from "@/components/ui/FormMessage";
import { formatAppError } from "@/lib/errors";
import { isValidEmail, isValidUsername } from "@/lib/validation";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useI18n } from "@/providers/LanguageProvider";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    username?: string;
    email?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function clearFieldError(field: "name" | "username" | "email" | "password") {
    if (fieldErrors[field]) {
      setFieldErrors((current) => ({ ...current, [field]: undefined }));
    }
  }

  async function onSubmit() {
    const nextFieldErrors: {
      name?: string;
      username?: string;
      email?: string;
      password?: string;
    } = {};
    if (!name.trim()) {
      nextFieldErrors.name = t("errorEnterName");
    }
    if (!username.trim()) {
      nextFieldErrors.username = t("errorEnterUsername");
    } else if (!isValidUsername(username)) {
      nextFieldErrors.username = t("errorInvalidEmail");
    }
    if (!email.trim()) {
      nextFieldErrors.email = t("errorEnterEmail");
    } else if (!isValidEmail(email)) {
      nextFieldErrors.email = t("errorInvalidEmailAddress");
    }
    if (!password) {
      nextFieldErrors.password = t("errorEnterPassword");
    } else if (password.length < 6) {
      nextFieldErrors.password = t("errorPasswordTooShort");
    }
    if (Object.values(nextFieldErrors).some(Boolean)) {
      setFieldErrors(nextFieldErrors);
      setError(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      setPostAuthRoute("/verify-email");
      const result = await signUp(
        name.trim(),
        username.trim(),
        password,
        email.trim(),
      );
      if (result.error) {
        setPostAuthRoute(null);
        setError(result.error);
        return;
      }

      router.replace("/verify-email");
    } catch (submitError) {
      setPostAuthRoute(null);
      setError(formatAppError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthSheetPage>
      <AuthSheetHeading
        title={t("signupTitle")}
        subtitle={t("signupSubtitle")}
      />
      <View style={{ gap: 14 }}>
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
          label={t("email")}
          placeholder={t("emailPlaceholder")}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            clearFieldError("email");
          }}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          error={fieldErrors.email}
          hint={t("emailHint")}
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
        <GoogleAuthSection disabled={isSubmitting} />
        <AuthLink
          prompt={t("alreadyHaveAccountPrompt")}
          action={t("alreadyHaveAccountAction")}
          onPress={() => router.replace("/login")}
        />
        <AuthLegal
          onPrivacy={() => router.push("/legal/privacy" as Href)}
          onTerms={() => router.push("/legal/terms" as Href)}
        />
      </View>
    </AuthSheetPage>
  );
}
