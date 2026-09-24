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
  getColors,
  getCssVars,
  shadow as baseShadow,
  type ThemeColors,
  type ThemeScheme,
} from "@/constants/theme";
import { readStoredTheme, writeStoredTheme } from "@/lib/theme-storage";

type ThemeContextValue = {
  scheme: ThemeScheme;
  colors: ThemeColors;
  shadow: typeof baseShadow;
  setScheme: (scheme: ThemeScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const themeVars = {
  light: vars(getCssVars(getColors("light"))),
  dark: vars(getCssVars(getColors("dark"))),
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [scheme, setSchemeState] = useState<ThemeScheme>(readStoredTheme);

  const colors = getColors(scheme);
  const shadow = useMemo(
    () => ({
      ...baseShadow,
      color: scheme === "dark" ? "#000000" : baseShadow.color,
      opacity: scheme === "dark" ? 0.4 : baseShadow.opacity,
    }),
    [scheme],
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
    void SystemUI.setBackgroundColorAsync(colors.ice).catch(() => {
      // Web and some devices do not support a system background color.
    });
  }, [scheme, colors.ice, setColorScheme]);

  const setScheme = useCallback((next: ThemeScheme) => {
    setSchemeState(next);
  }, []);

  const value = useMemo(
    () => ({
      scheme,
      colors,
      shadow,
      setScheme,
    }),
    [scheme, colors, shadow, setScheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <View
        style={[{ flex: 1, backgroundColor: colors.ice }, themeVars[scheme]]}
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
