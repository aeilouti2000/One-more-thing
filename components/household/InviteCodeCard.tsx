import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";

type InviteCodeCardProps = {
  code: string;
};

export function InviteCodeCard({ code }: InviteCodeCardProps) {
  const { t } = useI18n();

  return (
    <View className="rounded-3xl bg-cove-accent px-5 py-5">
      <AppText className="text-sm font-medium text-white">{t("inviteCode")}</AppText>
      <AppText className="mt-2 text-2xl font-semibold tracking-widest text-white">
        {code}
      </AppText>
      <AppText className="mt-2 text-sm leading-5 text-white">
        {t("inviteCodeHint")}
      </AppText>
    </View>
  );
}
