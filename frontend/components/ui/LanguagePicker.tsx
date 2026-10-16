import { LOCALES } from "@/constants/i18n";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { useI18n } from "@/providers/LanguageProvider";

type LanguagePickerProps = {
  size?: "regular" | "compact";
};

export function LanguagePicker({ size = "regular" }: LanguagePickerProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <SegmentedToggle
      size={size}
      value={locale}
      options={LOCALES}
      onChange={setLocale}
      accessibilityLabel={t("languageLabel")}
    />
  );
}
