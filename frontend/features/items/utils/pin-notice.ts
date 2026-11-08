import type { TranslationKey, TranslateVars } from "@/constants/i18n";
import type { PinInterval } from "@/features/items/api/pins";

const whenKey: Record<Exclude<PinInterval, 0>, TranslationKey> = {
  1: "pinReturnsDay",
  7: "pinReturnsWeek",
  14: "pinReturnsTwoWeeks",
  30: "pinReturnsMonth",
};

export function pinnedNotice(
  t: (key: TranslationKey, vars?: TranslateVars) => string,
  intervalDays: PinInterval,
  monthDay?: number | null,
) {
  if (intervalDays === 0) return t("pinnedNoticeOnce");
  if (intervalDays === 30 && monthDay) {
    return t("pinnedNotice", { when: t("pinReturnsMonthDay", { day: monthDay }) });
  }
  return t("pinnedNotice", { when: t(whenKey[intervalDays]) });
}
