import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";
import * as SystemUI from "expo-system-ui";
import { vars, useColorScheme } from "nativewind";
import {
  DEFAULT_ACCENT,
  getColors,
  getCssVars,
  normalizeHex,
  shadow as baseShadow,
  type ThemeColors,
  type ThemeScheme,
} from "@/constants/theme";
import {
  readStoredAccent,
  readStoredTheme,
  writeStoredAccent,
  writeStoredTheme,
} from "@/lib/theme-storage";

type ThemeContextValue = {
  scheme: ThemeScheme;
  accent: string;
  colors: ThemeColors;
  shadow: typeof baseShadow;
  setScheme: (scheme: ThemeScheme) => void;
  setAccent: (accent: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [scheme, setSchemeState] = useState<ThemeScheme>(readStoredTheme);
  const [accent, setAccentState] = useState(readStoredAccent);

  const colors = useMemo(() => getColors(scheme, accent), [scheme, accent]);
  const themeVars = useMemo(() => vars(getCssVars(colors)), [colors]);
  const shadow = useMemo(
    () => ({
      ...baseShadow,
      color: scheme === "dark" ? "#000000" : colors.ink,
      opacity: scheme === "dark" ? 0.4 : baseShadow.opacity,
    }),
    [scheme, colors.ink],
  );

  useEffect(() => {
    try {
      setColorScheme(scheme);
    } catch {
      // NativeWind still applies CSS variables from the root style.
    }

    const webDocument = (
      globalThis as {
        document?: { documentElement: { classList: { toggle: (name: string, force?: boolean) => void } } };
      }
    ).document;
    webDocument?.documentElement.classList.toggle("dark", scheme === "dark");

    writeStoredTheme(scheme);
    writeStoredAccent(accent);
    void SystemUI.setBackgroundColorAsync(colors.ice).catch(() => {
      // Web and some devices do not support a system background color.
    });
  }, [scheme, accent, colors.ice, setColorScheme]);

  const setScheme = useCallback((next: ThemeScheme) => {
    setSchemeState(next);
  }, []);

  const setAccent = useCallback((next: string) => {
    setAccentState(normalizeHex(next) ?? DEFAULT_ACCENT);
  }, []);

  const value = useMemo(
    () => ({
      scheme,
      accent,
      colors,
      shadow,
      setScheme,
      setAccent,
    }),
    [scheme, accent, colors, shadow, setScheme, setAccent],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View
        style={[{ flex: 1, backgroundColor: colors.ice }, themeVars]}
        className={scheme === "dark" ? "dark" : undefined}
      >
        {children}
      </View>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
