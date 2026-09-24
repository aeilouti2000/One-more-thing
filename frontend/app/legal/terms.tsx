import type { ReactNode } from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useI18n } from "@/providers/LanguageProvider";

export default function TermsScreen() {
  const { t } = useI18n();
  const app = t("appName");

  return (
    <Screen>
      <ScreenHeader title={t("termsTitle")} subtitle={t("termsSubtitle")} showBack />
      <View className="gap-4">
        <LegalParagraph>{t("terms1", { app })}</LegalParagraph>
        <LegalParagraph>{t("terms2")}</LegalParagraph>
        <LegalParagraph>{t("terms3")}</LegalParagraph>
        <LegalParagraph>{t("terms4")}</LegalParagraph>
      </View>
    </Screen>
  );
}

function LegalParagraph({ children }: { children: ReactNode }) {
  return (
    <AppText className="text-base leading-6 text-cove-muted">{children}</AppText>
  );
}
