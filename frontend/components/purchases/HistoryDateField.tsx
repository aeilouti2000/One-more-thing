import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { useI18n } from "@/providers/LanguageProvider";
import { useTheme } from "@/providers/ThemeProvider";

type HistoryDateFieldProps = {
  value: Date | null;
  onChange: (date: Date | null) => void;
};

export function HistoryDateField({ value, onChange }: HistoryDateFieldProps) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => startOfMonth(value ?? new Date()));
  const language = locale === "ar" ? "ar" : "en";
  const selected = value !== null;
  const label = value
    ? new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(value)
    : t("historyPickDate");
  const today = new Date();
  const days = buildMonth(cursor);
  const weekdays = weekdayLabels(language);

  function choose(day: Date) {
    onChange(day);
    setOpen(false);
  }

  return (
    <>
      <Pressable
        onPress={() => {
          setCursor(startOfMonth(value ?? new Date()));
          setOpen((current) => !current);
        }}
        accessibilityRole="button"
        accessibilityLabel={t("historyPickDate")}
        className="flex-row items-center gap-2 self-start rounded-full px-4 py-2"
        style={{ backgroundColor: selected ? colors.accent : colors.paper }}
      >
        <Ionicons
          name="calendar-outline"
          size={16}
          color={selected ? colors.white : colors.ink}
        />
        <AppText
          className="text-sm font-medium"
          style={{ color: selected ? colors.white : colors.ink }}
        >
          {label}
        </AppText>
      </Pressable>
      {open ? (
        <View
          className="mt-1 rounded-3xl px-3 py-3"
          style={{
            width: "100%",
            backgroundColor: colors.paper,
            borderWidth: 1,
            borderColor: colors.line,
          }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Pressable
              onPress={() => setCursor(shiftMonth(cursor, -1))}
              accessibilityRole="button"
              className="rounded-full px-3 py-2"
            >
              <Ionicons name="chevron-back" size={18} color={colors.ink} />
            </Pressable>
            <AppText className="text-sm font-semibold" style={{ color: colors.ink }}>
              {new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(cursor)}
            </AppText>
            <Pressable
              onPress={() => setCursor(shiftMonth(cursor, 1))}
              disabled={isFutureMonth(cursor, today)}
              accessibilityRole="button"
              className="rounded-full px-3 py-2"
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isFutureMonth(cursor, today) ? colors.line : colors.ink}
              />
            </Pressable>
          </View>
          <View className="mb-1 flex-row">
            {weekdays.map((weekday, index) => (
              <AppText
                key={`${index}-${weekday}`}
                className="flex-1 text-center text-xs font-medium"
                style={{ color: colors.muted }}
              >
                {weekday}
              </AppText>
            ))}
          </View>
          <View className="flex-row flex-wrap">
            {days.map((day, index) => {
              if (!day) {
                return <View key={`empty-${index}`} style={{ width: "14.28%", height: 40 }} />;
              }
              const disabled = isAfterDay(day, today);
              const isSelected = value ? sameDay(day, value) : false;
              const isToday = sameDay(day, today);
              return (
                <Pressable
                  key={day.toISOString()}
                  disabled={disabled}
                  onPress={() => choose(day)}
                  accessibilityRole="button"
                  className="items-center justify-center"
                  style={{ width: "14.28%", height: 40 }}
                >
                  <View
                    className="h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: isSelected ? colors.accent : "transparent",
                      borderWidth: isToday && !isSelected ? 1 : 0,
                      borderColor: colors.accent,
                    }}
                  >
                    <AppText
                      className="text-sm font-medium"
                      style={{
                        color: disabled
                          ? colors.line
                          : isSelected
                            ? colors.white
                            : colors.ink,
                      }}
                    >
                      {day.getDate()}
                    </AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </>
  );
}

function weekdayLabels(language: string) {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(language, { weekday: "narrow" }).format(new Date(2024, 0, index + 1)),
  );
}

function buildMonth(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const days: (Date | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= count; day += 1) {
    days.push(new Date(cursor.getFullYear(), cursor.getMonth(), day));
  }
  return days;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isFutureMonth(cursor: Date, today: Date) {
  return (
    cursor.getFullYear() > today.getFullYear() ||
    (cursor.getFullYear() === today.getFullYear() && cursor.getMonth() >= today.getMonth())
  );
}

function isAfterDay(day: Date, today: Date) {
  const left = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const right = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return left > right;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
