import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { RequireSession } from "@/features/auth/components/require-session";
import { maybeAskForPush } from "@/features/notifications/api/push";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { InviteCodeField } from "@/features/homes/components/invite-code-field";
import { fullInviteCode, isInviteComplete } from "@/features/homes/utils/invite-code";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useHousehold } from "@/features/homes/hooks/use-household";
import { joinHome } from "@/features/homes/api/homes";
import { useI18n } from "@/providers/LanguageProvider";

export default function JoinHomeScreen() {
  const { t } = useI18n();
  const { refresh, adoptHome } = useHousehold();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit() {
    if (!isInviteComplete(code)) {
      setError(t("errorEnterInviteCode"));
      return;
    }
    const inviteCode = fullInviteCode(code);

    setIsSubmitting(true);
    setError(null);
    const result = await joinHome(inviteCode);
    setIsSubmitting(false);

    if (result.home) {
      adoptHome(result.home);
      await refresh();
      router.replace("/items");
      // Joining someone's home is when list alerts become useful.
      void maybeAskForPush();
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
          <InviteCodeField value={code} onChange={setCode} onSubmit={() => void onSubmit()} />
          <View className="rounded-3xl bg-cove-paper p-5">
            <AppText className="text-base leading-6 text-cove-muted">
              {t("joinHomeHint")}
            </AppText>
          </View>
          <FormMessage message={error} />
          <AppButton
            label={t("joinThisHome")}
            disabled={!isInviteComplete(code)}
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />
        </View>
      </Screen>
    </RequireSession>
  );
}
