import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { FrostedBlur } from "@/components/ui/BlurBackdrop";
import { shareNeededText } from "@/lib/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type InviteCodeCardProps = {
  code: string;
  onCopied?: () => void;
};

export function InviteCodeCard({ code, onCopied }: InviteCodeCardProps) {
  const { t } = useI18n();
  const { scheme } = useTheme();

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

  const cardTint =
    scheme === "dark" ? "rgba(66, 165, 245, 0.55)" : "rgba(33, 150, 243, 0.72)";

  return (
    <View className="overflow-hidden rounded-[28px] border border-white/30 px-6 py-6">
      <FrostedBlur style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: cardTint,
          },
        ]}
      />
      <View
        pointerEvents="none"
        className="absolute -right-8 -top-16 h-36 w-16 rounded-full bg-white/20"
        style={{ transform: [{ rotate: "28deg" }] }}
      />
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
          className="h-11 w-11 items-center justify-center rounded-2xl bg-white/25 active:opacity-80"
        >
          <Ionicons name="share-social" size={20} color="#FFFFFF" />
        </Pressable>
      </View>
      <AppText className="mt-3 text-sm leading-5 text-white/90">
        {t("inviteCodeHint")}
      </AppText>
    </View>
  );
}
