import type { TranslationKey, TranslateVars } from "@/constants/i18n";
import type { PinInterval } from "@/features/items/api/pins";

const whenKey: Record<PinInterval, TranslationKey> = {
  1: "pinReturnsDay",
  7: "pinReturnsWeek",
  14: "pinReturnsTwoWeeks",
  30: "pinReturnsMonth",
};

export function pinnedNotice(
  t: (key: TranslationKey, vars?: TranslateVars) => string,
  intervalDays: PinInterval,
) {
  return t("pinnedNotice", { when: t(whenKey[intervalDays]) });
}
