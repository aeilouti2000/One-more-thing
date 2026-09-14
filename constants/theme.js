const lightColors = {
  ice: "#E3F2FD",
  paper: "#FFFFFF",
  mist: "#BBDEFB",
  line: "#90CAF9",
  muted: "#1565C0",
  ink: "#0D47A1",
  accent: "#2196F3",
  accentDeep: "#0D47A1",
  soft: "#E3F2FD",
  deep: "#0D47A1",
  white: "#FFFFFF",
  transparent: "transparent",
};

const darkColors = {
  ice: "#0B1526",
  paper: "#132238",
  mist: "#1E3A5F",
  line: "#2A4A73",
  muted: "#90CAF9",
  ink: "#E3F2FD",
  accent: "#42A5F5",
  accentDeep: "#90CAF9",
  soft: "#1A3050",
  deep: "#102A43",
  white: "#FFFFFF",
  transparent: "transparent",
};

const colors = lightColors;

const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  screen: 20,
};

const radius = {
  sm: 12,
  md: 16,
  lg: 24,
  xl: 28,
  full: 999,
};

const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  display: 30,
};

const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
};

const fonts = {
  sans: "System",
};

const iconSize = {
  sm: 22,
  md: 26,
};

const logo = {
  size: 72,
  radius: 999,
};

const tabBar = {
  height: 68,
  inset: 20,
  radius: 28,
  borderWidth: 1,
  labelSize: 12,
  itemPaddingTop: 4,
};

const shadow = {
  color: lightColors.ink,
  offset: { width: 0, height: 10 },
  opacity: 0.12,
  radius: 20,
  elevation: 12,
};

function getColors(scheme) {
  return scheme === "dark" ? darkColors : lightColors;
}

function getCssVars(palette) {
  return {
    "--color-cove-ice": palette.ice,
    "--color-cove-paper": palette.paper,
    "--color-cove-mist": palette.mist,
    "--color-cove-line": palette.line,
    "--color-cove-muted": palette.muted,
    "--color-cove-ink": palette.ink,
    "--color-cove-accent": palette.accent,
    "--color-cove-accent-deep": palette.accentDeep,
    "--color-cove-soft": palette.soft,
    "--color-cove-deep": palette.deep,
  };
}

const theme = {
  colors,
  spacing,
  radius,
  fontSize,
  fontWeight,
  fonts,
  iconSize,
  logo,
  tabBar,
  shadow,
};

module.exports = {
  colors,
  lightColors,
  darkColors,
  getColors,
  getCssVars,
  spacing,
  radius,
  fontSize,
  fontWeight,
  fonts,
  iconSize,
  logo,
  tabBar,
  shadow,
  theme,
};
