import { Linking, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppLogo } from "@/components/ui/AppLogo";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type ForceUpdateProps = {
  downloadUrl: string | null;
};

export function ForceUpdate({ downloadUrl }: ForceUpdateProps) {
  const { t } = useI18n();
  const { colors } = useTheme();

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      style={{ backgroundColor: colors.ice }}
    >
      <AppLogo size={88} />
      <AppText className="mt-6 text-center text-2xl font-semibold text-cove-ink">
        {t("updateRequired")}
      </AppText>
      <AppText className="mt-3 text-center text-base leading-6 text-cove-muted">
        {t("updateRequiredBody")}
      </AppText>
      {downloadUrl ? (
        <View className="mt-8 w-full max-w-sm">
          <AppButton
            label={t("updateNow")}
            onPress={() => void Linking.openURL(downloadUrl)}
          />
        </View>
      ) : null}
    </View>
  );
}
