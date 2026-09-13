export type ThemeScheme = "light" | "dark";

export type ThemeColors = {
  ice: string;
  paper: string;
  mist: string;
  line: string;
  muted: string;
  ink: string;
  accent: string;
  accentDeep: string;
  soft: string;
  deep: string;
  white: string;
  transparent: string;
};

export const colors: ThemeColors;
export const lightColors: ThemeColors;
export const darkColors: ThemeColors;

export function getColors(scheme: ThemeScheme): ThemeColors;
export function getCssVars(palette: ThemeColors): Record<string, string>;

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
