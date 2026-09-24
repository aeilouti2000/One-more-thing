import { useState } from "react";
import { router } from "expo-router";
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
import { isValidLoginName } from "@/lib/validation";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = username.trim().length > 0 && password.length > 0;

  async function onSubmit() {
    if (!isValidLoginName(username)) {
      setError(t("errorInvalidEmail"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await signIn(username, password);
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
        <ScreenHeader
          title={t("loginTitle")}
          subtitle={t("loginSubtitle")}
          showBack
        />

        <View className="mb-6 items-center">
          <AppLogo size={88} />
        </View>

        <View className="gap-6">
          <AppTextField
            label={t("username")}
            value={username}
            onChangeText={setUsername}
            placeholder={t("usernamePlaceholder")}
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
          />
          <AppTextField
            label={t("password")}
            value={password}
            onChangeText={setPassword}
            placeholder={t("passwordPlaceholder")}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
          />
          <FormMessage message={error} />
          <AppButton
            label={t("logIn")}
            disabled={!canSubmit}
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />
          <Pressable onPress={() => router.push("/signup")} className="items-center py-1">
            <AppText className="text-base text-cove-accent">
              {t("newHere")}
            </AppText>
          </Pressable>
        </View>
      </Screen>
    </GuestOnly>
  );
}
