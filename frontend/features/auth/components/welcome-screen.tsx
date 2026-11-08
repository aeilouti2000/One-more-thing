import { router, type Href } from "expo-router";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  AuthButton,
  AuthLegal,
  AuthLink,
} from "@/features/auth/components/auth-frame";
import { useAuthShell } from "@/features/auth/components/auth-shell";
import { GoogleAuthSection } from "@/features/auth/components/google-auth-section";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/**
 * Welcome: the brand fills the top of the auth frame (AuthShell); this is the
 * short sheet under it. Its height is reported so the sheet fits it exactly.
 */
export default function WelcomeScreen() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { setWelcomeHeight } = useAuthShell();

  return (
    <Animated.View
      entering={FadeIn.duration(240)}
      exiting={FadeOut.duration(120)}
      onLayout={(event) => setWelcomeHeight(event.nativeEvent.layout.height)}
      style={{
        paddingHorizontal: 22,
        paddingTop: 4,
        paddingBottom: Math.max(insets.bottom, 12) + 4,
        gap: 12,
        width: "100%",
        maxWidth: 480,
        alignSelf: "center",
      }}
    >
      <AppText
        className="text-sm"
        style={{ color: colors.muted, textAlign: "center" }}
      >
        {t("welcomeJoinHint")}
      </AppText>
      <GoogleAuthSection divider={false} />
      <AuthButton
        label={t("createAccount")}
        onPress={() => router.push("/signup")}
      />
      <AuthLink
        prompt={t("alreadyHaveAccountPrompt")}
        action={t("alreadyHaveAccountAction")}
        onPress={() => router.push("/login")}
      />
      <AuthLegal
        onPrivacy={() => router.push("/legal/privacy" as Href)}
        onTerms={() => router.push("/legal/terms" as Href)}
      />
    </Animated.View>
  );
}
