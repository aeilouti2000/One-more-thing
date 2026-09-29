import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { shareNeededText } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";

type InviteCodeCardProps = {
  code: string;
  onCopied?: () => void;
};

export function InviteCodeCard({ code, onCopied }: InviteCodeCardProps) {
  const { t } = useI18n();

  async function copyCode() {
    await Clipboard.setStringAsync(code);
    void Haptics.selectionAsync();
    onCopied?.();
  }

  async function shareCode() {
    const message = t("shareInviteMessage", { code });
    try {
      await shareNeededText(message);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
    }
  }

  return (
    <View className="rounded-3xl bg-cove-accent px-5 py-5">
      <View className="flex-row items-start justify-between gap-3">
        <Pressable
          onPress={() => void copyCode()}
          accessibilityRole="button"
          accessibilityLabel={t("inviteCode")}
          className="min-w-0 flex-1 active:opacity-80"
        >
          <AppText className="text-sm font-medium text-white">{t("inviteCode")}</AppText>
          <AppText className="mt-2 text-2xl font-semibold tracking-widest text-white">
            {code}
          </AppText>
        </Pressable>
        <Pressable
          onPress={() => void shareCode()}
          accessibilityRole="button"
          accessibilityLabel={t("shareInvite")}
          className="h-11 w-11 items-center justify-center rounded-2xl bg-white/20 active:opacity-80"
        >
          <Ionicons name="share-social" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
      <AppText className="mt-2 text-sm leading-5 text-white">
        {t("inviteCodeHint")}
      </AppText>
    </View>
  );
}
