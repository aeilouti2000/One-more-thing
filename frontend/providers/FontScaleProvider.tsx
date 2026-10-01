import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { arabicDefaultScale, fontScales, type FontScaleLevel } from "@/constants/font";
import { readStoredFontScale, writeStoredFontScale } from "@/lib/font-scale-storage";
import { useI18n } from "@/providers/LanguageProvider";

type FontScaleContextValue = {
  level: FontScaleLevel;
  scale: number;
  setLevel: (level: FontScaleLevel) => void;
};

const FontScaleContext = createContext<FontScaleContextValue | null>(null);

export function FontScaleProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  const [level, setLevelState] = useState<FontScaleLevel>(readStoredFontScale);

  const setLevel = useCallback((next: FontScaleLevel) => {
    setLevelState(next);
    writeStoredFontScale(next);
  }, []);

  const value = useMemo(
    () => ({
      level,
      scale: fontScales[level] * (locale === "ar" ? arabicDefaultScale : 1),
      setLevel,
    }),
    [level, locale, setLevel],
  );

  return <FontScaleContext.Provider value={value}>{children}</FontScaleContext.Provider>;
}

export function useFontScale() {
  const value = useContext(FontScaleContext);
  if (!value) {
    throw new Error("useFontScale must be used within FontScaleProvider");
  }
  return value;
}
