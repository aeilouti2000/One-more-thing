import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FormMessage } from "@/components/ui/FormMessage";
import { iconSize } from "@/constants/theme";
import {
  formatLaterDay,
  laterInDays,
  laterNextMonth,
  laterNextWeek,
  laterTomorrow,
  MAX_LATER_DAYS,
} from "@/features/items/utils/later-dates";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";
import { useMotionOff } from "@/providers/MotionProvider";

type LaterSheetProps = {
  visible: boolean;
  /** The one item being parked; with several, only their count is shown. */
  name: string | null;
  count: number;
  busy: boolean;
  error: string | null;
  /** null = no day: it stays parked until someone brings it back. */
  onPick: (until: Date | null) => void;
  onClose: () => void;
};

/** "Bring it back…": when a parked item should return to the list. */
export function LaterSheet({ visible, name, count, busy, error, onPick, onClose }: LaterSheetProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const motionOff = useMotionOff();
  // "Another day" opens a small day stepper in place of a calendar.
  const [days, setDays] = useState<number | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setDays(null);
  }

  const now = new Date();
  const options = [
    { id: "tomorrow", label: t("laterTomorrow"), date: laterTomorrow(now) },
    { id: "week", label: t("laterNextWeek"), date: laterNextWeek(now) },
    { id: "month", label: t("laterNextMonth"), date: laterNextMonth(now) },
  ];
  const picked = days === null ? null : laterInDays(days, now);

  function step(change: number) {
    void Haptics.selectionAsync();
    setDays((current) => Math.min(MAX_LATER_DAYS, Math.max(2, (current ?? 2) + change)));
  }

  return (
    <BottomSheet visible={visible} locked={busy} onClose={onClose}>
      <View className="gap-3">
        <View className="gap-1">
          <AppText className="text-xl font-semibold text-cove-ink" numberOfLines={2}>
            {name && count === 1
              ? t("laterSheetTitleOne", { name })
              : t("laterSheetTitleMany", { count })}
          </AppText>
          <AppText className="text-sm text-cove-muted">{t("laterSheetBody")}</AppText>
        </View>

        {options.map((option) => (
          <Option
            key={option.id}
            label={option.label}
            detail={formatLaterDay(option.date, locale)}
            disabled={busy}
            onPress={() => onPick(option.date)}
          />
        ))}

        {picked === null ? (
          <Option
            label={t("laterPickDay")}
            trailing={<Ionicons name="chevron-down" size={iconSize.sm} color={colors.muted} />}
            disabled={busy}
            onPress={() => {
              void Haptics.selectionAsync();
              setDays(3);
            }}
          />
        ) : (
          <Animated.View
            entering={motionOff ? undefined : FadeIn.duration(160)}
            className="gap-3 rounded-2xl bg-cove-mist p-3"
          >
            <View className="flex-row items-center gap-3">
              <StepButton
                icon="remove"
                label={t("laterEarlier")}
                disabled={busy || (days ?? 0) <= 2}
                onPress={() => step(-1)}
              />
              <View className="min-w-0 flex-1 items-center">
                <AppText className="text-base font-semibold text-cove-ink">
                  {formatLaterDay(picked, locale)}
                </AppText>
                <AppText className="text-xs text-cove-muted">
                  {t("laterInDays", { count: days ?? 0 })}
                </AppText>
              </View>
              <StepButton
                icon="add"
                label={t("laterFurther")}
                disabled={busy || (days ?? 0) >= MAX_LATER_DAYS}
                onPress={() => step(1)}
              />
            </View>
            <AppButton
              label={t("laterParkUntil", { date: formatLaterDay(picked, locale) })}
              loading={busy}
              disabled={busy}
              onPress={() => onPick(picked)}
              compact
            />
          </Animated.View>
        )}

        <Option
          label={t("laterNoDate")}
          detail={t("laterNoDateBody")}
          disabled={busy}
          onPress={() => onPick(null)}
        />

        <FormMessage message={error} />
      </View>
    </BottomSheet>
  );
}

function Option({
  label,
  detail,
  trailing,
  disabled,
  onPress,
}: {
  label: string;
  detail?: string;
  trailing?: React.ReactNode;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ disabled }}
      className="flex-row items-center justify-between gap-3 rounded-2xl bg-cove-mist px-4 py-4 active:opacity-80"
      style={{ opacity: disabled ? 0.6 : 1 }}
    >
      <AppText className="shrink text-base font-semibold text-cove-ink">{label}</AppText>
      {trailing ?? (
        <AppText numberOfLines={1} className="shrink text-sm text-cove-muted">
          {detail}
        </AppText>
      )}
    </Pressable>
  );
}

function StepButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: "add" | "remove";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      className="h-11 w-11 items-center justify-center rounded-full bg-cove-paper active:opacity-80"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Ionicons name={icon} size={20} color={colors.accentText} />
    </Pressable>
  );
}
