import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { FormMessage } from "@/components/ui/FormMessage";
import {
  AuthButton,
  AuthField,
  AuthTextAction,
} from "@/features/auth/components/auth-frame";
import {
  AuthSheetHeading,
  AuthSheetPage,
} from "@/features/auth/components/auth-shell";
import { useAuth } from "@/features/auth/providers/auth-provider";
import { useResendCountdown } from "@/hooks/use-resend-countdown";
import { isValidLoginName } from "@/lib/validation";
import { useI18n } from "@/providers/LanguageProvider";

type Step = "request" | "reset";

/** Two steps: ask for a code by username/email, then code + new password. */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ login?: string }>();
  const { requestPasswordReset, resetPassword } = useAuth();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("request");
  const [login, setLogin] = useState(
    typeof params.login === "string" ? params.login : "",
  );
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    login?: string;
    code?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { seconds, restart } = useResendCountdown();

  async function sendCode(isResend: boolean) {
    if (!login.trim()) {
      setFieldErrors({ login: t("errorEnterLogin") });
      return;
    }
    if (!isValidLoginName(login)) {
      setFieldErrors({ login: t("errorInvalidLogin") });
      return;
    }
    setIsSubmitting(!isResend);
    setError(null);
    setNotice(null);
    const result = await requestPasswordReset(login);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    restart();
    if (isResend) setNotice(t("codeSent"));
    setStep("reset");
  }

  async function onReset() {
    const next: { code?: string; password?: string } = {};
    if (!/^\d{6}$/.test(code.trim())) next.code = t("errorEnterCode");
    if (!password) next.password = t("errorEnterPassword");
    else if (password.length < 6) next.password = t("errorPasswordTooShort");
    if (next.code || next.password) {
      setFieldErrors(next);
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setNotice(null);
    const result = await resetPassword(login, code, password);
    setIsSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.replace("/");
  }

  return (
    <AuthSheetPage>
      {step === "request" ? (
        <>
          <AuthSheetHeading
            title={t("forgotTitle")}
            subtitle={t("forgotSubtitle")}
          />
          <View style={{ gap: 16 }}>
            <AuthField
              label={t("usernameOrEmail")}
              placeholder={t("usernameOrEmailPlaceholder")}
              value={login}
              onChangeText={(value) => {
                setLogin(value);
                setFieldErrors({});
              }}
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              error={fieldErrors.login}
              hint={t("resetNoEmailHint")}
            />
            <FormMessage message={error} />
            <AuthButton
              label={t("sendCode")}
              loading={isSubmitting}
              onPress={() => void sendCode(false)}
            />
            <AuthTextAction
              label={t("backToLogin")}
              align="center"
              onPress={() => {
                // Opened from a link there may be nothing to go back to.
                if (router.canGoBack()) router.back();
                else router.replace("/login");
              }}
            />
          </View>
        </>
      ) : (
        <>
          <AuthSheetHeading
            title={t("forgotTitle")}
            subtitle={t("resetCodeSubtitle", { login: login.trim() })}
          />
          <View style={{ gap: 16 }}>
            <AuthField
              label={t("verificationCode")}
              placeholder={t("codePlaceholder")}
              value={code}
              onChangeText={(value) => {
                setCode(value.replace(/\D/g, "").slice(0, 6));
                setFieldErrors((current) => ({
                  ...current,
                  code: undefined,
                }));
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
              autoFocus
              error={fieldErrors.code}
            />
            <AuthField
              label={t("newPassword")}
              placeholder={t("passwordMinPlaceholder")}
              value={password}
              onChangeText={(value) => {
                setPassword(value);
                setFieldErrors((current) => ({
                  ...current,
                  password: undefined,
                }));
              }}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              error={fieldErrors.password}
            />
            <AuthTextAction
              label={seconds > 0 ? t("resendIn", { seconds }) : t("resendCode")}
              disabled={seconds > 0}
              onPress={() => void sendCode(true)}
            />
            <FormMessage message={error} />
            <FormMessage message={notice} tone="success" />
            <AuthButton
              label={t("setNewPassword")}
              loading={isSubmitting}
              onPress={() => void onReset()}
            />
            <AuthTextAction
              label={t("useDifferentAccount")}
              align="center"
              onPress={() => {
                setStep("request");
                setCode("");
                setPassword("");
                setError(null);
                setNotice(null);
                setFieldErrors({});
              }}
            />
          </View>
        </>
      )}
    </AuthSheetPage>
  );
}
