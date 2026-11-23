import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { ShimmerBlock } from "@/components/ui/ShimmerBlock";
import { withAlpha } from "@/constants/theme";
import { addMonths, monthKey } from "@/features/items/utils/history";
import { formatMoney } from "@/features/items/utils/currency";
import { useI18n } from "@/providers/LanguageProvider";
import { useMotionOff } from "@/providers/MotionProvider";
import { useTheme } from "@/providers/ThemeProvider";

/** Mockup: numbers count up in 600 ms (ease-out cubic). */
export const COUNT_UP_MS = 600;
/** Mockup: a new row fades and rises in 280 ms. */
export const ROW_FADE_MS = 280;

function intlLocale(locale: string) {
  return locale === "ar" ? "ar" : "en";
}

/** "November" (the month's own year added when it is not this year). */
export function monthTitle(month: string, locale: string, now = new Date()) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1, 1);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    ...(year !== now.getFullYear() ? { year: "numeric" } : null),
  }).format(date);
}

/** "Nov" for the month chips ("Nov 2025" for another year). */
export function monthShort(month: string, locale: string, now = new Date()) {
  const [year, index] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: "short",
    ...(year !== now.getFullYear() ? { year: "numeric" } : null),
  }).format(new Date(year, index - 1, 1));
}

/** "Today", "Yesterday", or "Mon, Nov 18" for a "YYYY-MM-DD" day. */
export function dayTitle(day: string, locale: string, labels: { today: string; yesterday: string }) {
  const now = new Date();
  const today = `${monthKey(now)}-${String(now.getDate()).padStart(2, "0")}`;
  const before = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterday = `${monthKey(before)}-${String(before.getDate()).padStart(2, "0")}`;
  if (day === today) return labels.today;
  if (day === yesterday) return labels.yesterday;
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(year !== now.getFullYear() ? { year: "numeric" } : null),
  }).format(new Date(year, month - 1, date));
}

export function currentMonth() {
  return monthKey(new Date());
}

export function previousMonth() {
  return addMonths(monthKey(new Date()), -1);
}

/**
 * A number that counts from its last value to the new one (600 ms). With
 * Animations off it simply shows the new value.
 */
export function useCountUp(value: number) {
  const motionOff = useMotionOff();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    const start = from.current;
    if (motionOff || start === value) {
      from.current = value;
      setShown(value);
      return;
    }
    const began = Date.now();
    const step = () => {
      const progress = Math.min(1, (Date.now() - began) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = start + (value - start) * eased;
      from.current = next;
      setShown(next);
      frame.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [motionOff, value]);

  return shown;
}

/** The header above one day's purchases, with its total once the day is complete. */
export function DayHeader({
  title,
  total,
  currency,
}: {
  title: string;
  total: number | null;
  currency: string;
}) {
  return (
    <View className="mb-2 mt-1 flex-row items-center justify-between px-2">
      <AppText className="text-xs font-semibold uppercase tracking-wider text-cove-muted">{title}</AppText>
      {total !== null ? (
        <AppText className="text-xs font-semibold text-cove-muted">{formatMoney(total, currency)}</AppText>
      ) : null}
    </View>
  );
}

/** Placeholder rows while a page loads (two at the end of the list, more at first). */
export function SkeletonRows({ count }: { count: number }) {
  const { colors, scheme } = useTheme();
  const tone = scheme === "dark" ? colors.mist : withAlpha(colors.accentText, 0.1);
  const highlight = scheme === "dark" ? withAlpha(colors.white, 0.08) : "rgba(255,255,255,0.72)";
  return (
    <View className="gap-3">
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          className="flex-row items-center gap-3 rounded-[22px] px-[18px] py-4"
          style={{ backgroundColor: colors.paper }}
        >
          <ShimmerBlock width={34} height={34} tone={tone} highlight={highlight} />
          <View className="flex-1 gap-2">
            <ShimmerBlock width={index % 2 ? 120 : 150} height={11} tone={tone} highlight={highlight} />
            <ShimmerBlock width={index % 2 ? 70 : 90} height={9} tone={tone} highlight={highlight} />
          </View>
          <ShimmerBlock width={40} height={11} tone={tone} highlight={highlight} />
        </View>
      ))}
    </View>
  );
}

/** A quiet one-line note in the mist colour (offline, cleaned, end of month). */
export function HistoryNote({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  const { colors } = useTheme();
  return (
    <View className="mb-3 flex-row items-center gap-2.5 rounded-2xl bg-cove-mist px-3.5 py-3">
      <Ionicons name={icon} size={16} color={colors.accentText} />
      <AppText className="min-w-0 flex-1 text-sm text-cove-ink">{text}</AppText>
    </View>
  );
}

export function useLocaleLabels() {
  const { t } = useI18n();
  return { today: t("historyToday"), yesterday: t("historyYesterday") };
}
