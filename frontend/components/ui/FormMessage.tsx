import { AppText } from "@/components/ui/AppText";
import { localizeMessage } from "@/constants/i18n";
import { useI18n } from "@/providers/LanguageProvider";

type FormMessageProps = {
  message?: string | null;
  tone?: "default" | "success";
};

export function FormMessage({ message, tone = "default" }: FormMessageProps) {
  useI18n();

  if (!message) {
    return null;
  }

  return (
    <AppText
      className={`text-base leading-6 ${
        tone === "success" ? "text-cove-accent" : "text-red-600 dark:text-red-400"
      }`}
    >
      {localizeMessage(message)}
    </AppText>
  );
}
