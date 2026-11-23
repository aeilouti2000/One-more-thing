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
  getGlassColors,
  normalizeGlassFrost,
  normalizeHex,
  normalizeSurfaceDepth,
  shadow as baseShadow,
  type GlassFrost,
  type SurfaceDepth,
  type ThemeColors,
  type ThemeScheme,
} from "@/constants/theme";
import {
  readStoredAccent,
  readStoredGlassFrost,
  readStoredSurfaceDepth,
  readStoredThemePreference,
  writeStoredAccent,
  writeStoredGlassFrost,
  writeStoredSurfaceDepth,
  writeStoredThemePreference,
  type ThemePreference,
} from "@/lib/theme-storage";
import { setAppNightMode } from "@/modules/app-night-mode/src";

type ThemeContextValue = {
  /** The theme in use: the phone's, unless the user picked one. Glass counts as dark. */
  scheme: ThemeScheme;
  /**
   * The glass theme is on: `colors.paper`, `mist`, `soft` and `line` are
   * see-through, and pages draw a GlassBackdrop behind their content.
   */
  glass: boolean;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  accent: string;
  surfaceDepth: SurfaceDepth;
  glassFrost: GlassFrost;
  colors: ThemeColors;
  shadow: typeof baseShadow;
  setScheme: (scheme: ThemeScheme) => void;
  setAccent: (accent: string) => void;
  setSurfaceDepth: (depth: SurfaceDepth) => void;
  setGlassFrost: (frost: GlassFrost) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { setColorScheme } = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>(
    readStoredThemePreference,
  );
  const system = useSystemColorScheme();
  const glass = preference === "glass";
  const scheme: ThemeScheme =
    preference === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : glass
        ? "dark"
        : preference;
  const [accent, setAccentState] = useState(readStoredAccent);
  const [surfaceDepth, setSurfaceDepthState] = useState<SurfaceDepth>(
    readStoredSurfaceDepth,
  );
  const [glassFrost, setGlassFrostState] = useState<GlassFrost>(readStoredGlassFrost);

  const colors = useMemo(
    () =>
      glass
        ? getGlassColors(accent, glassFrost)
        : getColors(scheme, accent, surfaceDepth),
    [glass, scheme, accent, surfaceDepth, glassFrost],
  );
  const themeVars = useMemo(() => vars(getCssVars(colors)), [colors]);
  const shadow = useMemo(
    () => ({
      ...baseShadow,
      color: scheme === "dark" ? "#000000" : colors.ink,
      opacity: scheme === "dark" ? 0.4 : baseShadow.opacity,
      // Android draws a shadow under the whole view: through glass it shows as a grey slab.
      elevation: glass ? 0 : baseShadow.elevation,
    }),
    [glass, scheme, colors.ink],
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
    // Android shows its launch splash before any JS runs; this is how it learns the app's theme.
    setAppNightMode(preference === "system" ? "system" : scheme);

    writeStoredAccent(accent);
    writeStoredSurfaceDepth(surfaceDepth);
    writeStoredGlassFrost(glassFrost);
    void SystemUI.setBackgroundColorAsync(colors.ice).catch(() => {
      // Web and some devices do not support a system background color.
    });
  }, [scheme, preference, accent, surfaceDepth, glassFrost, colors.ice, setColorScheme]);

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

  const setGlassFrost = useCallback((next: GlassFrost) => {
    setGlassFrostState(normalizeGlassFrost(next));
  }, []);

  const value = useMemo(
    () => ({
      scheme,
      glass,
      preference,
      setPreference,
      accent,
      surfaceDepth,
      glassFrost,
      colors,
      shadow,
      setScheme,
      setAccent,
      setSurfaceDepth,
      setGlassFrost,
    }),
    [
      scheme,
      glass,
      preference,
      setPreference,
      accent,
      surfaceDepth,
      glassFrost,
      colors,
      shadow,
      setScheme,
      setAccent,
      setSurfaceDepth,
      setGlassFrost,
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
