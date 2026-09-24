import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { RequireSession } from "@/components/auth/RequireSession";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useHousehold } from "@/hooks/useHousehold";
import { joinHome } from "@/lib/homes";
import { useI18n } from "@/providers/LanguageProvider";

export default function JoinHomeScreen() {
  const { t } = useI18n();
  const { refresh, adoptHome } = useHousehold();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit() {
    const inviteCode = code.trim();
    if (!inviteCode) {
      setError(t("errorEnterInviteCode"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await joinHome(inviteCode);
    setIsSubmitting(false);

    if (result.home) {
      adoptHome(result.home);
      await refresh();
      router.replace("/items");
      return;
    }

    if (result.error) {
      setError(result.error);
      return;
    }

    await refresh();
    router.replace("/items");
  }

  return (
    <RequireSession redirectIfHome>
      <Screen>
        <ScreenHeader
          title={t("joinHome")}
          subtitle={t("joinHomeSubtitle")}
          showBack
        />

        <View className="gap-6">
          <AppTextField
            label={t("inviteCode")}
            value={code}
            onChangeText={(value) => setCode(value.toUpperCase())}
            placeholder={t("inviteCodePlaceholder")}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <View className="rounded-3xl bg-cove-paper p-5">
            <AppText className="text-base leading-6 text-cove-muted">
              {t("joinHomeHint")}
            </AppText>
          </View>
          <FormMessage message={error} />
          <AppButton
            label={t("joinThisHome")}
            disabled={!code.trim()}
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />
        </View>
      </Screen>
    </RequireSession>
  );
}
