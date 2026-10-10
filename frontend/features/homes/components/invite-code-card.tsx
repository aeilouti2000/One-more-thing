import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { floatedCardStyle, withAlpha } from "@/constants/theme";
import { shareNeededText } from "@/features/items/utils/share-list";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type InviteCodeCardProps = {
  code: string;
  homeName?: string;
  onCopied?: () => void;
};

export function InviteCodeCard({ code, homeName, onCopied }: InviteCodeCardProps) {
  const { t, isRTL } = useI18n();
  const { colors, scheme } = useTheme();
  const dark = scheme === "dark";

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
    <View
      className="overflow-hidden rounded-[28px] px-5 py-5"
      style={floatedCardStyle(scheme, colors)}
    >
      <View
        className="flex-row items-center gap-3"
        style={{ flexDirection: isRTL ? "row-reverse" : "row" }}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withAlpha(colors.accent, dark ? 0.16 : 0.1) }}
        >
          <Ionicons name="people-outline" size={22} color={colors.accent} />
        </View>
        <View className="min-w-0 flex-1">
          <AppText
            className="text-base font-semibold text-cove-ink"
            style={{ textAlign: isRTL ? "right" : "left" }}
          >
            {t("inviteCode")}
          </AppText>
          {homeName ? (
            <AppText
              className="mt-0.5 text-sm text-cove-muted"
              numberOfLines={1}
              style={{ textAlign: isRTL ? "right" : "left" }}
            >
              {homeName}
            </AppText>
          ) : null}
        </View>
        <Pressable
          onPress={() => void shareCode()}
          accessibilityRole="button"
          accessibilityLabel={t("shareInvite")}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full bg-cove-accent active:opacity-80"
        >
          <Ionicons name="share-outline" size={16} color={colors.onAccent} />
        </Pressable>
      </View>

      <AppText
        className="mt-4 text-sm leading-5 text-cove-muted"
        style={{ textAlign: isRTL ? "right" : "left" }}
      >
        {t("inviteCodeHint")}
      </AppText>

      <Pressable
        onPress={() => void copyCode()}
        accessibilityRole="button"
        accessibilityLabel={t("inviteCode")}
        className="mt-3 flex-row items-center gap-3 rounded-2xl px-4 py-4 active:opacity-80"
        style={{
          flexDirection: isRTL ? "row-reverse" : "row",
          backgroundColor: dark ? withAlpha(colors.white, 0.06) : "#F4F5F7",
          borderWidth: 1,
          borderColor: dark ? withAlpha(colors.white, 0.1) : withAlpha("#12141A", 0.08),
        }}
      >
        <AppText
          className="min-w-0 flex-1 text-xl font-semibold tracking-widest text-cove-ink"
          style={{ textAlign: isRTL ? "right" : "left" }}
          numberOfLines={1}
        >
          {code}
        </AppText>
        <Ionicons name="copy-outline" size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}
