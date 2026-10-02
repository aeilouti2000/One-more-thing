const DEFAULT_ACCENT = "#2196F3";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;
  return `#${hex.toUpperCase()}`;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex) ?? DEFAULT_ACCENT;
  const value = normalized.slice(1);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  const toHex = (channel) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToHsl(hex) {
  let { r, g, b } = hexToRgb(hex);
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;

  if (max !== min) {
    const delta = max - min;
    saturation =
      lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    switch (max) {
      case r:
        hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        hue = ((b - r) / delta + 2) / 6;
        break;
      default:
        hue = ((r - g) / delta + 4) / 6;
        break;
    }
  }

  return {
    h: hue * 360,
    s: saturation * 100,
    l: lightness * 100,
  };
}

function hslToHex(h, s, l) {
  const saturation = clamp(s, 0, 100) / 100;
  const lightness = clamp(l, 0, 100) / 100;
  const chroma = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    const color =
      lightness - chroma * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return rgbToHex(channel(0), channel(8), channel(4));
}

function mixHex(from, to, amount) {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const t = clamp(amount, 0, 1);
  return rgbToHex(
    a.r + (b.r - a.r) * t,
    a.g + (b.g - a.g) * t,
    a.b + (b.b - a.b) * t,
  );
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function buildColors(scheme, accentHex) {
  const accent = normalizeHex(accentHex) ?? DEFAULT_ACCENT;
  const { h, s } = hexToHsl(accent);
  const neutral = s < 12;

  if (neutral) {
    if (scheme === "dark") {
      return {
        ice: "#0E0E0E",
        paper: "#1A1A1A",
        mist: "#242424",
        line: "#333333",
        muted: "#B0B0B0",
        ink: "#F2F2F2",
        accent: "#E0E0E0",
        accentDeep: "#BDBDBD",
        soft: "#161616",
        deep: "#121212",
        white: "#FFFFFF",
        transparent: "transparent",
      };
    }

    return {
      ice: "#F5F5F5",
      paper: "#FFFFFF",
      mist: "#EEEEEE",
      line: "#D6D6D6",
      muted: "#616161",
      ink: "#212121",
      accent: "#212121",
      accentDeep: "#000000",
      soft: "#F5F5F5",
      deep: "#212121",
      white: "#FFFFFF",
      transparent: "transparent",
    };
  }

  const sat = clamp(s, 42, 88);

  if (scheme === "dark") {
    const tint = hslToHex(h, sat, 48);
    return {
      ice: mixHex("#0A1018", tint, 0.22),
      paper: mixHex("#121C28", tint, 0.34),
      mist: mixHex("#162436", tint, 0.4),
      line: mixHex("#1E3048", tint, 0.48),
      muted: hslToHex(h, clamp(sat, 40, 72), 74),
      ink: hslToHex(h, clamp(sat * 0.35, 18, 42), 93),
      accent: hslToHex(h, sat, 62),
      accentDeep: hslToHex(h, clamp(sat, 40, 72), 74),
      soft: mixHex("#101820", tint, 0.28),
      deep: mixHex("#0C1420", tint, 0.24),
      white: "#FFFFFF",
      transparent: "transparent",
    };
  }

  return {
    ice: hslToHex(h, clamp(sat, 40, 72), 94),
    paper: "#FFFFFF",
    mist: hslToHex(h, clamp(sat, 38, 68), 88),
    line: hslToHex(h, clamp(sat, 40, 72), 78),
    muted: hslToHex(h, clamp(sat + 8, 48, 86), 38),
    ink: hslToHex(h, clamp(sat + 12, 52, 90), 28),
    accent: hslToHex(h, sat, 54),
    accentDeep: hslToHex(h, clamp(sat + 12, 52, 90), 28),
    soft: hslToHex(h, clamp(sat, 40, 72), 94),
    deep: hslToHex(h, clamp(sat + 12, 52, 90), 28),
    white: "#FFFFFF",
    transparent: "transparent",
  };
}

const lightColors = buildColors("light", DEFAULT_ACCENT);
const darkColors = buildColors("dark", DEFAULT_ACCENT);
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
  sm: 13,
  md: 15,
  lg: 17,
  xl: 19,
  display: 26,
};

const fontWeight = {
  regular: "400",
  medium: "500",
  semibold: "600",
};

const fonts = {
  sans: "ReadexPro_400Regular",
  medium: "ReadexPro_500Medium",
  semibold: "ReadexPro_600SemiBold",
  bold: "ReadexPro_700Bold",
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

function getColors(scheme, accentHex = DEFAULT_ACCENT) {
  return buildColors(scheme, accentHex);
}

function glassFieldStyle(scheme, palette = getColors(scheme)) {
  if (scheme === "dark") {
    return {
      backgroundColor: withAlpha(palette.paper, 0.92),
      borderColor: withAlpha(palette.muted, 0.45),
    };
  }

  return {
    backgroundColor: withAlpha(palette.white, 0.96),
    borderColor: withAlpha(palette.accent, 0.32),
  };
}

function floatedCardStyle(scheme, palette = getColors(scheme)) {
  return {
    borderWidth: 1,
    borderColor:
      scheme === "dark"
        ? withAlpha(palette.muted, 0.42)
        : withAlpha(palette.accent, 0.28),
  };
}

function headerIconFrameStyle(scheme, palette = getColors(scheme)) {
  return {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor:
      scheme === "dark"
        ? withAlpha(palette.muted, 0.55)
        : withAlpha(palette.white, 0.55),
    backgroundColor: withAlpha(palette.white, 0.2),
  };
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
  DEFAULT_ACCENT,
  colors,
  lightColors,
  darkColors,
  getColors,
  getCssVars,
  normalizeHex,
  hexToHsl,
  hslToHex,
  withAlpha,
  glassFieldStyle,
  floatedCardStyle,
  headerIconFrameStyle,
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
