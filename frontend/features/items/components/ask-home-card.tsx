import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import { FormMessage } from "@/components/ui/FormMessage";
import { firstName } from "@/features/items/api/shop-locks";
import type { ShopAsk } from "@/features/items/api/shop-asks";
import { NeedsInternetTag, useNeedsInternet } from "@/features/offline/components/needs-internet";
import { showNeedsInternet } from "@/features/offline/sync-status";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useMotionOff } from "@/providers/MotionProvider";

/** With more people than this, the answers start folded to one line. */
const OPEN_BY_DEFAULT_UP_TO = 3;

type AskHomeCardProps = {
  /** The shopper's open question on this list; null before asking. */
  ask: ShopAsk | null;
  asking: boolean;
  error: string | null;
  onAsk: () => void;
};

/**
 * "Anything missing?" at the top of a trip. Before asking: one button for the
 * whole home. After: who answered what, one line per person.
 */
export function AskHomeCard({ ask, asking, error, onAsk }: AskHomeCardProps) {
  const { t, isRTL } = useI18n();
  const { colors, glass, scheme } = useTheme();
  const motionOff = useMotionOff();
  const { offline } = useNeedsInternet();
  const [open, setOpen] = useState<boolean | null>(null);
  // "4 min ago" moves on by itself while the card is on screen.
  const [now, setNow] = useState(() => Date.now());
  const askId = ask?.id ?? null;
  useEffect(() => {
    if (!askId) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [askId]);

  const icon = (
    <View className="h-11 w-11 items-center justify-center rounded-full bg-cove-mist">
      <Ionicons name="chatbubbles-outline" size={21} color={colors.accentText} />
    </View>
  );

  if (!ask && offline) {
    // Asking reaches the others through the server: with no connection the
    // card stays in place, dimmed, and a tap says why.
    return (
      <Pressable
        onPress={showNeedsInternet}
        accessibilityRole="button"
        accessibilityLabel={t("askHomeButton")}
        accessibilityState={{ disabled: true }}
        className="mb-3 rounded-3xl bg-cove-paper px-4 py-3.5"
      >
        <View className="flex-row items-center gap-3">
          <View className="min-w-0 flex-1 flex-row items-center gap-3" style={{ opacity: 0.4 }}>
            {icon}
            <View className="min-w-0 flex-1">
              <AppText className="text-base font-semibold text-cove-ink">{t("askHomeTitle")}</AppText>
              <AppText className="mt-0.5 text-sm text-cove-muted" numberOfLines={1}>
                {t("askHomeBody")}
              </AppText>
            </View>
          </View>
          <NeedsInternetTag />
        </View>
      </Pressable>
    );
  }

  if (!ask) {
    return (
      <View className="mb-3 rounded-3xl bg-cove-paper px-4 py-3.5">
        <View className="flex-row items-center gap-3">
          {icon}
          <View className="min-w-0 flex-1">
            <AppText className="text-base font-semibold text-cove-ink">{t("askHomeTitle")}</AppText>
            <AppText className="mt-0.5 text-sm text-cove-muted">{t("askHomeBody")}</AppText>
          </View>
          {/* Round send button; the label is for screen readers. */}
          <Pressable
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onAsk();
            }}
            disabled={asking}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={t("askHomeButton")}
            accessibilityState={{ disabled: asking, busy: asking }}
            className="active:scale-95 active:opacity-90"
          >
            <View
              className="h-12 w-12 items-center justify-center rounded-full"
              style={{
                // Glass lightens accentText for text; a button keeps the accent itself.
                backgroundColor: glass ? colors.accent : colors.accentText,
                shadowColor: colors.accentText,
                shadowOpacity: scheme === "dark" ? 0.45 : 0.35,
                shadowRadius: 10,
                shadowOffset: { width: 0, height: 4 },
                elevation: 4,
              }}
            >
              {asking ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Ionicons
                  name="send"
                  size={20}
                  color={colors.onAccent}
                  // Points the way text reads; nudged right so it looks centred.
                  style={{ transform: [{ scaleX: isRTL ? -1 : 1 }, { translateX: 1.5 }] }}
                />
              )}
            </View>
          </Pressable>
        </View>
        <FormMessage message={error} />
      </View>
    );
  }

  const answered = ask.replies.filter((reply) => reply.reply !== null || reply.added > 0).length;
  const minutes = Math.max(0, Math.floor((now - new Date(ask.createdAt).getTime()) / 60_000));
  const time = minutes < 1 ? t("askHomeJustNow") : t("askHomeMinutesAgo", { minutes });
  const expanded = open ?? ask.replies.length <= OPEN_BY_DEFAULT_UP_TO;
  const addedColor = scheme === "dark" ? "#6EE7A8" : "#166534";
  const summary = t("askHomeAnswered", { answered, total: ask.replies.length, time });

  return (
    <Animated.View
      entering={motionOff ? undefined : FadeIn.duration(200)}
      layout={motionOff ? undefined : LinearTransition.duration(200)}
      className="mb-3 rounded-3xl bg-cove-paper px-4 py-3.5"
    >
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen(!expanded);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${t("askHomeAsked")}. ${summary}. ${t(
          expanded ? "askHomeHideReplies" : "askHomeShowReplies",
        )}`}
        className="flex-row items-center gap-3 active:opacity-80"
      >
        {icon}
        <View className="min-w-0 flex-1">
          <AppText className="text-base font-semibold text-cove-ink">{t("askHomeAsked")}</AppText>
          <AppText numberOfLines={1} className="mt-0.5 text-sm text-cove-muted">
            {summary}
          </AppText>
        </View>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
      </Pressable>

      {expanded ? (
        <Animated.View
          entering={motionOff ? undefined : FadeIn.duration(160)}
          className="mt-3 gap-2.5"
        >
          {ask.replies.map((reply) => {
            const name = firstName(reply.name) || reply.name;
            const added = reply.added > 0;
            const text = added
              ? t("askHomeReplyAdded", { count: reply.added })
              : reply.reply === "nothing"
                ? t("askHomeReplyNothing")
                : t("askHomeReplyWaiting");
            const waiting = !added && reply.reply === null;
            return (
              <View
                key={reply.userId}
                accessible
                accessibilityLabel={`${name}: ${text}`}
                className="flex-row items-center gap-3"
              >
                <View className="h-7 w-7 items-center justify-center rounded-full bg-cove-mist">
                  <AppText className="text-xs font-semibold text-cove-accent-text">
                    {name.slice(0, 1).toUpperCase()}
                  </AppText>
                </View>
                <AppText numberOfLines={1} className="min-w-0 flex-1 text-sm text-cove-ink">
                  {name}
                </AppText>
                <AppText
                  numberOfLines={1}
                  className={`shrink text-sm ${added ? "font-semibold" : ""}`}
                  style={{
                    color: added ? addedColor : colors.muted,
                    opacity: waiting ? 0.7 : 1,
                  }}
                >
                  {text}
                </AppText>
              </View>
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
