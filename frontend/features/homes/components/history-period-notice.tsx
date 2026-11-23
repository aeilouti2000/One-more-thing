import { Ionicons } from "@expo/vector-icons";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { withAlpha } from "@/constants/theme";
import type { HomeHistory } from "@/features/homes/types/household";
import { keptFrom, longDate, shortDate } from "@/features/homes/utils/history-period";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** The amber of the host lock: a notice, not an error. Light mode uses the mockup's solid cream. */
const WARM = "#F0B04A";
const WARM_PAPER = "#FFF4DC";

/** "3 months" in the reader's language. */
export function useHistoryPeriodLabel() {
  const { t } = useI18n();
  return (months: number) =>
    months === 3
      ? t("historyPeriod3")
      : months === 6
        ? t("historyPeriod6")
        : months === 12
          ? t("historyPeriod12")
          : t("historyPeriodN", { months });
}

/**
 * A shorter History period is waiting for its date (mockup screen 4): when it
 * applies, and from which day purchases go. `action` is the host's button;
 * `onClose` shows the close cross.
 */
export function HistoryPeriodNotice({
  history,
  action,
  footnote,
  onClose,
}: {
  history: HomeHistory;
  action?: { label: string; onPress: () => void; disabled?: boolean };
  /** Shown instead of an action (someone who is not the host). */
  footnote?: string;
  onClose?: () => void;
}) {
  const { t, locale } = useI18n();
  const { colors, scheme } = useTheme();
  const periodLabel = useHistoryPeriodLabel();
  if (!history.pending) return null;
  const { months, from } = history.pending;
  const ink = scheme === "dark" ? "#F5D08A" : "#7A4B00";

  return (
    <View
      className="mb-3 rounded-3xl px-4 py-3.5"
      style={{ backgroundColor: scheme === "dark" ? withAlpha(WARM, 0.16) : WARM_PAPER }}
    >
      <View className="flex-row items-start gap-2">
        <AppText className="min-w-0 flex-1 text-sm font-semibold" style={{ color: ink }}>
          {t("historyPendingTitle", { date: shortDate(from, locale), period: periodLabel(months) })}
        </AppText>
        {onClose ? (
          <Pressable
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t("historyNoticeClose")}
            className="active:opacity-60"
          >
            <Ionicons name="close" size={16} color={ink} />
          </Pressable>
        ) : null}
      </View>
      <AppText className="mt-1 text-sm" style={{ color: ink }}>
        {t("historyPendingBody", { day: longDate(keptFrom(from, months), locale) })}
      </AppText>
      {action ? (
        <Pressable
          onPress={action.onPress}
          disabled={action.disabled}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          className="mt-2.5 self-start rounded-full px-3.5 py-1.5 active:opacity-80"
          style={{ backgroundColor: colors.paper, opacity: action.disabled ? 0.5 : 1 }}
        >
          <AppText className="text-sm font-semibold" style={{ color: ink }}>
            {action.label}
          </AppText>
        </Pressable>
      ) : footnote ? (
        <AppText className="mt-2 text-xs font-semibold" style={{ color: ink }}>
          {footnote}
        </AppText>
      ) : null}
    </View>
  );
}
