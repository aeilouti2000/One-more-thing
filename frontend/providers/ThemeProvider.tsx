import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { View, useColorScheme as useSystemColorScheme } from "react-native";
import * as SystemUI from "expo-system-ui";
import { vars, useColorScheme } from "nativewind";
import {
  DEFAULT_ACCENT,
  DEFAULT_SURFACE_DEPTH,
  getColors,
  getCssVars,
  normalizeHex,
  normalizeSurfaceDepth,
  shadow as baseShadow,
  type SurfaceDepth,
  type ThemeColors,
  type ThemeScheme,
} from "@/constants/theme";
import {
  readStoredAccent,
  readStoredSurfaceDepth,
  readStoredThemePreference,
  writeStoredAccent,
  writeStoredSurfaceDepth,
  writeStoredThemePreference,
  type ThemePreference,
} from "@/lib/theme-storage";

type ThemeContextValue = {
  /** The theme in use: the phone's, unless the user picked one. */
  scheme: ThemeScheme;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  accent: string;
  surfaceDepth: SurfaceDepth;
  colors: ThemeColors;
  shadow: typeof baseShadow;
  setScheme: (scheme: ThemeScheme) => void;
  setAccent: (accent: string) => void;
  setSurfaceDepth: (depth: SurfaceDepth) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readStoredThemePreference,
  );
  const system = useSystemColorScheme();
  const scheme: ThemeScheme =
    preference === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : preference;
  const [accent, setAccentState] = useState(readStoredAccent);
  const [surfaceDepth, setSurfaceDepthState] = useState<SurfaceDepth>(
    readStoredSurfaceDepth,
  );

  const colors = useMemo(
    () => getColors(scheme, accent, surfaceDepth),
    [scheme, accent, surfaceDepth],
  );
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
      // "system" hands control back to the phone, so its changes reach us.
      setColorScheme(preference === "system" ? "system" : scheme);
    } catch {
      // NativeWind still applies CSS variables from the root style.
    }

    const webDocument = (
      globalThis as {
        document?: {
          documentElement: {
            classList: { toggle: (name: string, force?: boolean) => void };
          };
        };
      }
    ).document;
    webDocument?.documentElement.classList.toggle("dark", scheme === "dark");

    writeStoredAccent(accent);
    writeStoredSurfaceDepth(surfaceDepth);
    void SystemUI.setBackgroundColorAsync(colors.ice).catch(() => {
      // Web and some devices do not support a system background color.
    });
  }, [scheme, preference, accent, surfaceDepth, colors.ice, setColorScheme]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    writeStoredThemePreference(next);
  }, []);

  /** Picking light or dark is an explicit choice that stops following the phone. */
  const setScheme = useCallback(
    (next: ThemeScheme) => setPreference(next),
    [setPreference],
  );

  const setAccent = useCallback((next: string) => {
    setAccentState(normalizeHex(next) ?? DEFAULT_ACCENT);
  }, []);

  const setSurfaceDepth = useCallback((next: SurfaceDepth) => {
    setSurfaceDepthState(normalizeSurfaceDepth(next) ?? DEFAULT_SURFACE_DEPTH);
  }, []);

  const value = useMemo(
    () => ({
      scheme,
      preference,
      setPreference,
      accent,
      surfaceDepth,
      colors,
      shadow,
      setScheme,
      setAccent,
      setSurfaceDepth,
    }),
    [
      scheme,
      preference,
      setPreference,
      accent,
      surfaceDepth,
      colors,
      shadow,
      setScheme,
      setAccent,
      setSurfaceDepth,
    ],
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
