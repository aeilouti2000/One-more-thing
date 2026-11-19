import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { firstName } from "@/features/items/api/shop-locks";
import type { ShopAsk, ShopAskReply } from "@/features/items/api/shop-asks";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type ShopAskCardProps = {
  ask: ShopAsk;
  /** The answer being sent right now. */
  busy: boolean;
  error: string | null;
  onAdd: () => void;
  onReply: (reply: ShopAskReply) => void;
};

/**
 * Someone is at the shop and asked if anything is missing: the same question
 * the notification asks, for whoever opens the app instead.
 */
export function ShopAskCard({ ask, busy, error, onAdd, onReply }: ShopAskCardProps) {
  const { t } = useI18n();
  const { colors } = useTheme();
  const name = firstName(ask.askedByName) || t("partner");
  // Once they added something, the second button closes the question instead.
  const added = ask.myAdded > 0;

  return (
    <Animated.View
      entering={FadeIn.duration(220)}
      exiting={FadeOut.duration(160)}
      layout={LinearTransition.duration(200)}
      className="mb-3 rounded-3xl bg-cove-paper px-4 py-3.5"
    >
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-full bg-cove-mist">
          <Ionicons name="chatbubbles-outline" size={21} color={colors.accentText} />
        </View>
        <View className="min-w-0 flex-1">
          <AppText numberOfLines={1} className="text-base font-semibold text-cove-ink">
            {t("shopAskAt", { name })}
          </AppText>
          <AppText className="mt-0.5 text-sm text-cove-muted">
            {added ? t("shopAskYouAdded", { count: ask.myAdded }) : t("shopAskNeed")}
          </AppText>
        </View>
      </View>
      <View className="mt-3 flex-row gap-2.5">
        <View className="min-w-0 flex-1">
          <AppButton label={t("shopAskAddItem")} onPress={onAdd} disabled={busy} compact />
        </View>
        <View className="min-w-0 flex-1">
          <AppButton
            label={added ? t("shopAskDone") : t("shopAskNothing")}
            variant="secondary"
            onPress={() => onReply(added ? "done" : "nothing")}
            loading={busy}
            disabled={busy}
            compact
          />
        </View>
      </View>
      <FormMessage message={error} />
    </Animated.View>
  );
}
