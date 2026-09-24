import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { GuestOnly } from "@/components/auth/GuestOnly";
import { AppButton } from "@/components/ui/AppButton";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { logo } from "@/constants/theme";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

export default function WelcomeScreen() {
  const { t } = useI18n();
  const { scheme } = useTheme();

  return (
    <GuestOnly>
      <Screen>
        <View className="flex-1 justify-between">
          <View
            className={`-mx-5 -mt-2 overflow-hidden rounded-b-3xl px-5 pb-8 pt-10 ${
              scheme === "dark" ? "bg-cove-deep" : "bg-cove-accent"
            }`}
          >
            <View
              pointerEvents="none"
              className="absolute -right-10 -top-16 h-40 w-5 rounded-full"
              style={{
                backgroundColor: "rgba(255,255,255,0.18)",
                transform: [{ rotate: "32deg" }],
              }}
            />
            <View
              pointerEvents="none"
              className="absolute right-5 -top-12 h-36 w-2 rounded-full"
              style={{
                backgroundColor: "rgba(255,255,255,0.1)",
                transform: [{ rotate: "32deg" }],
              }}
            />
            <View
              pointerEvents="none"
              className="absolute bottom-0 left-5 right-5 h-px"
              style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
            />
            <View className="relative z-10">
              <View className="mb-5 flex-row items-center gap-4">
                <AppLogo size={logo.size} />
                <AppText className="flex-1 text-3xl font-semibold text-white">
                  {t("appName")}
                </AppText>
              </View>
              <AppText
                className="max-w-[320px] text-lg leading-7 text-white"
                style={{ opacity: 0.9 }}
              >
                {t("appTagline")}
              </AppText>
            </View>
          </View>

          <View className="mt-16 gap-6">
            <View className="gap-3 rounded-3xl bg-cove-paper p-5">
              <AppText className="text-base font-semibold text-cove-ink">
                {t("howItWorks")}
              </AppText>
              <AppText className="text-base leading-6 text-cove-muted">
                {t("howItWorksBody")}
              </AppText>
            </View>

            <View className="gap-3">
              <AppButton
                label={t("logIn")}
                onPress={() => router.push("/login")}
              />
              <AppButton
                label={t("createAccount")}
                variant="secondary"
                onPress={() => router.push("/signup")}
              />
            </View>

            <View className="flex-row flex-wrap justify-center gap-x-4 gap-y-2">
              <Pressable onPress={() => router.push("/legal/privacy" as Href)}>
                <AppText className="text-sm text-cove-muted">{t("privacyPolicy")}</AppText>
              </Pressable>
              <Pressable onPress={() => router.push("/legal/terms" as Href)}>
                <AppText className="text-sm text-cove-muted">{t("terms")}</AppText>
              </Pressable>
            </View>
          </View>
        </View>
      </Screen>
    </GuestOnly>
  );
}
