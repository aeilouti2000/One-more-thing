import type { ReactNode } from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useI18n } from "@/providers/LanguageProvider";

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
      </View>
    </Screen>
  );
}

function LegalParagraph({ children }: { children: ReactNode }) {
  return (
    <AppText className="text-base leading-6 text-cove-muted">{children}</AppText>
  );
}
