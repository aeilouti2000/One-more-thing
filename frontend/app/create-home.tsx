import { useState } from "react";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { RequireSession } from "@/components/auth/RequireSession";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { AppTextField } from "@/components/ui/AppTextField";
import { FormMessage } from "@/components/ui/FormMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useHousehold } from "@/hooks/useHousehold";
import { alreadyHasHome, createHome, fetchMyHousehold } from "@/lib/homes";
import { useAuth } from "@/providers/AuthProvider";
import { useI18n } from "@/providers/LanguageProvider";

export default function CreateHomeScreen() {
  const { signOut } = useAuth();
  const { t } = useI18n();
  const { refresh, adoptHome } = useHousehold();
  const [name, setName] = useState(t("homeNamePlaceholder"));
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function onSubmit() {
    const homeName = name.trim();
    if (!homeName) {
      setError(t("errorEnterHomeName"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const result = await createHome(homeName);

    if (result.home) {
      adoptHome({
        id: result.home.id,
        name: result.home.name,
        inviteCode: result.home.invite_code,
        members: [],
      });
      setIsSubmitting(false);
      router.replace("/items");
      return;
    }

    if (alreadyHasHome(result.error)) {
      const existing = (await refresh()) ?? (await fetchMyHousehold());
      setIsSubmitting(false);
      if (existing) {
        adoptHome(existing);
        router.replace("/items");
        return;
      }
    }

    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
    }
  }

  async function onSignOut() {
    setIsSigningOut(true);
    setError(null);
    const result = await signOut();
    setIsSigningOut(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    router.replace("/");
  }

  return (
    <RequireSession redirectIfHome>
      <Screen>
        <ScreenHeader
          title={t("createYourPlace")}
          subtitle={t("createYourPlaceSubtitle")}
        />

        <View className="gap-6">
          <AppTextField
            label={t("homeName")}
            value={name}
            onChangeText={setName}
            placeholder={t("homeNamePlaceholder")}
            userText
          />
          <View className="rounded-3xl bg-cove-paper p-5">
            <AppText className="text-base leading-6 text-cove-muted">
              {t("createHomeHint")}
            </AppText>
          </View>
          <FormMessage message={error} />
          <AppButton
            label={t("continue")}
            disabled={!name.trim()}
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />
          <Pressable
            onPress={() => router.push("/join-home")}
            className="items-center py-1"
          >
            <AppText className="text-base text-cove-accent">
              {t("haveCode")}
            </AppText>
          </Pressable>
          <AppButton
            label={t("logOut")}
            variant="ghost"
            loading={isSigningOut}
            onPress={() => void onSignOut()}
          />
        </View>
      </Screen>
    </RequireSession>
  );
}
