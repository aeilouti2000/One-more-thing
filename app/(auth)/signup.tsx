import { useState } from "react";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { GuestOnly } from "@/components/auth/GuestOnly";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { isValidEmail } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";

export default function SignupScreen() {
  const { signUp } = useAuth();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && password.length >= 6;

  async function onSubmit() {
    if (!isValidEmail(email)) {
      setError(t("errorInvalidEmail"));
      return;
    }

    if (password.length < 6) {
      setError(t("errorPasswordTooShort"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await signUp(name, email, password);
    setIsSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.replace("/");
  }

  return (
    <GuestOnly>
      <Screen>
        <ScreenHeader
          title={t("signupTitle")}
          subtitle={t("signupSubtitle")}
          showBack
        />

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
            onChangeText={setEmail}
            placeholder={t("emailPlaceholder")}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
          />
          <AppTextField
            label={t("password")}
            value={password}
            onChangeText={setPassword}
            placeholder={t("passwordMinPlaceholder")}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
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
