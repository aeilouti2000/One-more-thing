import type { ReactNode } from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useI18n } from "@/providers/LanguageProvider";

const SUPPORT_EMAIL = "onemorething95@gmail.com";

export default function PrivacyPolicyScreen() {
  const { t } = useI18n();
  const app = t("appName");

  return (
    <Screen>
      <ScreenHeader title={t("privacyTitle")} subtitle={t("privacySubtitle")} showBack />
      <View className="gap-4">
        <LegalParagraph>{t("privacy1", { app })}</LegalParagraph>
        <LegalParagraph>{t("privacy2")}</LegalParagraph>
        <LegalParagraph>{t("privacy3")}</LegalParagraph>
        <LegalParagraph>{t("privacy4")}</LegalParagraph>
        <LegalParagraph>{t("privacy5")}</LegalParagraph>
        <LegalParagraph>{t("privacy6")}</LegalParagraph>
        <LegalParagraph>{t("privacy7")}</LegalParagraph>
        <LegalParagraph>{t("privacy8", { contact: SUPPORT_EMAIL })}</LegalParagraph>
      </View>
    </Screen>
  );
}

function LegalParagraph({ children }: { children: ReactNode }) {
  return (
    <AppText className="text-base leading-6 text-cove-muted">{children}</AppText>
  );
}
