import { useState } from "react";
import { router } from "expo-router";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { FormMessage } from "@/components/ui/FormMessage";
import {
  AuthDivider,
  AuthGoogleButton,
} from "@/features/auth/components/auth-frame";
import { isGoogleSignInAvailable } from "@/features/auth/lib/google-sign-in";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useI18n } from "@/providers/LanguageProvider";

/** "or" + "Continue with Google". Hidden where Google sign-in can't run (Expo Go, web). */
export function GoogleAuthSection({
  disabled = false,
  divider = true,
  buttonStyle,
}: {
  disabled?: boolean;
  /** The "or" line above the button (off where Google is the first action). */
  divider?: boolean;
  buttonStyle?: StyleProp<ViewStyle>;
}) {
  const { signInWithGoogle } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isGoogleSignInAvailable()) return null;

  async function onPress() {
    setLoading(true);
    setError(null);
    const result = await signInWithGoogle();
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (!result.cancelled) router.replace("/");
  }

  return (
    <View style={{ gap: divider ? 16 : 8 }}>
      {divider ? <AuthDivider label={t("orDivider")} /> : null}
      <AuthGoogleButton
        style={buttonStyle}
        label={t("continueWithGoogle")}
        loading={loading}
        disabled={disabled}
        onPress={() => void onPress()}
      />
      <FormMessage message={error} />
    </View>
  );
}
