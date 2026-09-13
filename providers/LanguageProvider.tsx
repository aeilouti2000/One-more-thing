import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { I18nManager, View } from "react-native";
import {
  setActiveLocale,
  translate,
  type Locale,
  type TranslateVars,
  type TranslationKey,
} from "@/constants/i18n";
import { readStoredLocale, writeStoredLocale } from "@/lib/language-storage";

type LanguageContextValue = {
  locale: Locale;
  isRTL: boolean;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, vars?: TranslateVars) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);
  const isRTL = locale === "ar";

  useEffect(() => {
    setActiveLocale(locale);
    writeStoredLocale(locale);
    I18nManager.allowRTL(isRTL);

    const webDocument = (
      globalThis as {
        document?: {
          documentElement: {
            lang: string;
            dir: string;
          };
        };
      }
    ).document;

    if (webDocument) {
      webDocument.documentElement.lang = locale;
      webDocument.documentElement.dir = isRTL ? "rtl" : "ltr";
    }
  }, [locale, isRTL]);

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: TranslateVars) => translate(key, vars, locale),
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      isRTL,
      setLocale,
      t,
    }),
    [locale, isRTL, setLocale, t],
  );

  return (
    <LanguageContext.Provider value={value}>
      <View style={{ flex: 1, direction: isRTL ? "rtl" : "ltr" }}>{children}</View>
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useI18n must be used inside LanguageProvider");
  }
  return context;
}
