export type ThemeScheme = "light" | "dark";

export type SurfaceDepth = "soft" | "default" | "deep" | "true";

export type ThemeColors = {
  ice: string;
  paper: string;
  mist: string;
  line: string;
  muted: string;
  ink: string;
  accent: string;
  accentDeep: string;
  onAccent: string;
  soft: string;
  deep: string;
  white: string;
  transparent: string;
};

export const DEFAULT_ACCENT: string;
export const DEFAULT_SURFACE_DEPTH: SurfaceDepth;
export const SURFACE_DEPTH_LEVELS: readonly SurfaceDepth[];

export const colors: ThemeColors;
export const lightColors: ThemeColors;
export const darkColors: ThemeColors;

export function getColors(
  scheme: ThemeScheme,
  accentHex?: string,
  surfaceDepth?: SurfaceDepth,
): ThemeColors;
export function getCssVars(palette: ThemeColors): Record<string, string>;
export function normalizeHex(value: string | null | undefined): string | null;
export function normalizeSurfaceDepth(
  value: string | null | undefined,
): SurfaceDepth;
export function hexToHsl(hex: string): { h: number; s: number; l: number };
export function hslToHex(h: number, s: number, l: number): string;
export function withAlpha(hex: string, alpha: number): string;

export function glassFieldStyle(
  scheme: ThemeScheme,
  palette?: ThemeColors,
): {
  borderRadius: number;
  backgroundColor: string;
  borderColor: string;
};

export function floatedCardStyle(
  scheme: ThemeScheme,
  palette?: ThemeColors,
): {
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export function floatedSectionStyle(
  scheme: ThemeScheme,
  palette?: ThemeColors,
): {
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
};

/** Outer floated sheet corner radius. */
export const floatedRadius: number;
/** Fields / buttons / badges inside floated sheets. */
export const floatedControlRadius: number;

export function headerIconFrameStyle(
  scheme: ThemeScheme,
  palette?: ThemeColors,
): {
  width: number;
  height: number;
  borderRadius: number;
  borderWidth: number;
  borderColor: string;
  backgroundColor: string;
};

export function headerActionStyle(
  scheme: ThemeScheme,
  palette?: ThemeColors,
): {
  backgroundColor: string;
  color: string;
};

export const spacing: {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  screen: number;
};

export const radius: {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
};

export const fontSize: {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  display: number;
};

export const fontWeight: {
  regular: "400";
  medium: "500";
  semibold: "600";
};

export const fonts: {
  sans: string;
  medium: string;
  semibold: string;
  bold: string;
};

export const iconSize: {
  sm: number;
  md: number;
};

export const logo: {
  size: number;
  radius: number;
};

export const tabBar: {
  height: number;
  inset: number;
  radius: number;
  borderWidth: number;
  labelSize: number;
  itemPaddingTop: number;
};

export const shadow: {
  color: string;
  offset: { width: number; height: number };
  opacity: number;
  radius: number;
  elevation: number;
};

export const theme: {
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  fontSize: typeof fontSize;
  fontWeight: typeof fontWeight;
  fonts: typeof fonts;
  iconSize: typeof iconSize;
  logo: typeof logo;
  tabBar: typeof tabBar;
  shadow: typeof shadow;
};
