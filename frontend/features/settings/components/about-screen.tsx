import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import { FloatMessage } from "@/components/ui/FloatMessage";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { APP_NAME } from "@/constants/app";
import {
  CardBlock,
  SettingsLinkCard,
  SettingsSection,
} from "@/features/settings/components/settings-ui";
import { useUpdateState } from "@/features/settings/components/settings-nav-list";
import {
  useSettingsShowBack,
  useSettingsSplitJoin,
  useSettingsTabBarInset,
} from "@/features/settings/hooks/use-settings-chrome";
import { checkAppUpdate, installedAppVersion, readUpdateState } from "@/lib/app-release";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

const SUPPORT_EMAIL = "onemorething95@gmail.com";

const WHATS_NEW = [
  "whatsNew1",
  "whatsNew2",
  "whatsNew3",
  "whatsNew4",
  "whatsNew5",
  "whatsNew6",
] as const;

export default function AboutScreen() {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const showBack = useSettingsShowBack();
  const tabBarInset = useSettingsTabBarInset();
  const splitJoin = useSettingsSplitJoin("detail");
  const update = useUpdateState();
  const [isChecking, setIsChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const [fixReady, setFixReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const version = installedAppVersion();

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function onCheck() {
    setIsChecking(true);
    setCheckFailed(false);
    setToast(null);
    let fixFound = false;
    // The result lands in the shared update state this page reads.
    await checkAppUpdate({ patient: false });
    // Small fixes arrive without a new install; fetch one now if it's waiting.
    if (Updates.isEnabled) {
      try {
        const found = await Updates.checkForUpdateAsync();
        if (found.isAvailable) {
          await Updates.fetchUpdateAsync();
          setFixReady(true);
          fixFound = true;
        }
      } catch {
        // Not available in development; the next app start checks again.
      }
    }
    setIsChecking(false);
    setCheckFailed(true);
    // Nothing newer anywhere: say so, since the button otherwise just stops.
    if (!fixFound && readUpdateState().status === "current") setToast(t("upToDate"));
  }

  // Set only when the app runs a fix downloaded after it was installed.
  const fixDate =
    Updates.isEnabled && !Updates.isEmbeddedLaunch && Updates.createdAt
      ? new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en", {
          day: "numeric",
          month: "short",
        }).format(Updates.createdAt)
      : null;

  function onReport() {
    const subject = encodeURIComponent(`${APP_NAME} ${version} (${Platform.OS})`);
    void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => undefined);
  }

  const status =
    update.status === "available"
      ? t("updateReady", { version: update.version })
      : update.status === "current"
        ? null
        : checkFailed && !isChecking
          ? t("updateCheckFailed")
          : null;

  return (
    <Screen
      tabBarInset={tabBarInset}
      floating={toast ? <FloatMessage message={toast} tone="success" wide /> : null}
      // On phones the tab bar is hidden here, so the toast can rest at the bottom.
      floatingLow={!tabBarInset}
    >
      <ScreenHeader
        title={t("aboutHelp")}
        subtitle={t("aboutHelpSummary")}
        showBack={showBack}
        splitJoin={splitJoin}
      />

      <SettingsSection>
        <CardBlock>
          <View className="items-center py-2">
            <AppLogo size={64} />
            <AppText className="mt-3 text-lg font-semibold text-cove-ink">{APP_NAME}</AppText>
            {status ? (
              <AppText className="mt-1 text-center text-sm text-cove-muted">{status}</AppText>
            ) : null}
          </View>
          <View className="mt-3">
            {fixReady ? (
              <AppButton
                label={t("restartToUpdate")}
                icon="refresh-outline"
                onPress={() => void Updates.reloadAsync().catch(() => undefined)}
              />
            ) : update.status === "available" ? (
              <AppButton
                label={t("updateNow")}
                icon="arrow-down-circle-outline"
                onPress={() => void Linking.openURL(update.downloadUrl).catch(() => undefined)}
              />
            ) : Platform.OS === "web" ? null : (
              <AppButton
                label={t("checkForUpdate")}
                variant="secondary"
                loading={isChecking}
                disabled={isChecking}
                onPress={() => void onCheck()}
              />
            )}
          </View>
        </CardBlock>

        <CardBlock>
          <AppText className="text-base font-semibold text-cove-ink">
            {t("whatsNewTitle", { version })}
          </AppText>
          {WHATS_NEW.map((key) => (
            <View key={key} className="mt-3 flex-row items-start gap-3">
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.accent} />
              <AppText className="min-w-0 flex-1 text-sm leading-5 text-cove-muted">
                {t(key)}
              </AppText>
            </View>
          ))}
        </CardBlock>

        <SettingsLinkCard
          icon="mail-outline"
          title={t("reportProblem")}
          body={t("reportProblemBody")}
          onPress={onReport}
          colors={colors}
        />
        <SettingsLinkCard
          icon="document-text-outline"
          title={t("privacyPolicy")}
          body={t("privacyPolicyBody")}
          onPress={() => router.push("/legal/privacy" as Href)}
          colors={colors}
        />
        <SettingsLinkCard
          icon="reader-outline"
          title={t("terms")}
          body={t("termsBody")}
          onPress={() => router.push("/legal/terms" as Href)}
          colors={colors}
        />
      </SettingsSection>

      <AppText className="mt-6 text-center text-xs text-cove-muted">
        {[
          `${APP_NAME} ${version}`,
          fixDate ? t("fixesFrom", { date: fixDate }) : null,
          update.status === "current" ? t("upToDate") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </AppText>
    </Screen>
  );
}
