import { useEffect, useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { FormMessage } from "@/components/ui/FormMessage";
import {
  AuthBrand,
  AuthButton,
  AuthField,
  AuthFrame,
  AuthHeading,
  AuthTextAction,
} from "@/features/auth/components/auth-frame";
import { RequireSession } from "@/features/auth/components/require-session";
import { setPostAuthRoute } from "@/features/auth/lib/post-auth-route";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useResendCountdown } from "@/hooks/use-resend-countdown";
import { useI18n } from "@/providers/LanguageProvider";

/** Shown right after sign-up: enter the code we emailed, or skip for now. */
export default function VerifyEmailScreen() {
  return (
    <RequireSession>
      <VerifyEmailContent />
    </RequireSession>
  );
}

function VerifyEmailContent() {
  const { user, verifyEmail, resendEmailCode } = useAuth();
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { seconds, restart } = useResendCountdown();

  useEffect(() => {
    setPostAuthRoute(null);
  }, []);

  function leave() {
    router.replace("/");
  }

  async function onVerify() {
    if (!/^\d{6}$/.test(code.trim())) {
      setFieldError(t("errorEnterCode"));
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    const result = await verifyEmail(code);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    leave();
  }

  async function onResend() {
    setError(null);
    setNotice(null);
    const result = await resendEmailCode();
    if (result.error) {
      setError(result.error);
      return;
    }
    restart();
    setNotice(t("codeSent"));
  }

  return (
    <AuthFrame>
      <AuthBrand />
      <AuthHeading
        title={t("verifyEmailTitle")}
        subtitle={t("verifyEmailSubtitle", { email: user?.contactEmail ?? "" })}
      />
      <View style={{ marginTop: 26, gap: 16 }}>
        <AuthField
          label={t("verificationCode")}
          placeholder={t("codePlaceholder")}
          value={code}
          onChangeText={(value) => {
            setCode(value.replace(/\D/g, "").slice(0, 6));
            setFieldError(undefined);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          error={fieldError}
        />
        <AuthTextAction
          label={seconds > 0 ? t("resendIn", { seconds }) : t("resendCode")}
          disabled={seconds > 0}
          onPress={() => void onResend()}
        />
        <FormMessage message={error} />
        <FormMessage message={notice} tone="success" />
        <AuthButton
          label={t("verify")}
          loading={isSubmitting}
          onPress={() => void onVerify()}
        />
        <AuthTextAction label={t("doItLater")} align="center" onPress={leave} />
      </View>
    </AuthFrame>
  );
}
